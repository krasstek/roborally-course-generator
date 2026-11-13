// Robo Rally Course Randomizer - overlays: mini overlay tiles, laser bundles and structural board overlays
import {
  buildMainFootprintTiles,
  buildResolvedMap,
  placePiece,
  rotatedDimensions
} from "../../board.js";
import { canMoveBetween } from "../analysis/movement.js";
import { CARDINAL_DIRS, LASER_BUNDLE_DEFINITIONS, ROTATIONS } from "./config.js";
import {
  findUnanchoredLaserEnds,
  getCombinedPlacedTileFeatureMap,
  getDockTileKeySet,
  getFullRectOffsets,
  getOppositeSide,
  getPhysicalBoardId,
  getSpaceBridgeColour,
  getPlacedTileFeatureMap,
  getPlacementOccupiedOffsets,
  getPlacementOccupiedTiles,
  isBlankCustomBoardPiece,
  isMiniOverlayPiece,
  tileContinuesLaserBeam,
  tileHasLaserSupportBlock
} from "./layout-geometry.js";
import {
  OVERLAY_MODES,
  normalizeOverlayMode,
  shouldUseBoardOverlays,
  shouldUseMiniOverlays
} from "./preferences.js";
import { sample, shuffle } from "./random.js";

export function getAvailableOverlayIds(pieceMap, expansionIds = null) {
  return Object.values(pieceMap)
    .filter((piece) => piece.overlayCapable)
    .filter((piece) => !expansionIds || expansionIds.has(piece.expansionId))
    .map((piece) => piece.id);
}

// Which overlay kinds the selected sets offer: tokens (mini overlays) and/or
// 6x6 boards.
export function getAvailableOverlayKinds(pieceMap, expansionIds = null) {
  const ids = getAvailableOverlayIds(pieceMap, expansionIds);
  return {
    tokens: ids.some((id) => isMiniOverlayPiece(pieceMap[id])),
    boards: ids.some((id) => !isMiniOverlayPiece(pieceMap[id]))
  };
}

export function chooseWeightedCount(maxCount, weightForCount) {
  if (maxCount <= 0) {
    return 0;
  }

  const bag = [];
  for (let count = 0; count <= maxCount; count += 1) {
    const copies = Math.max(1, Math.round(weightForCount(count)));
    for (let copy = 0; copy < copies; copy += 1) {
      bag.push(count);
    }
  }

  return sample(bag);
}

export function chooseBlankBoardMiniOverlayCount(maxCount) {
  return chooseWeightedCount(maxCount, (count) => {
    if (count === 0) {
      return 2;
    }

    const ratio = count / Math.max(1, maxCount);
    if (ratio >= 0.3 && ratio <= 0.7) {
      return ratio >= 0.4 && ratio <= 0.6 ? 6 : 5;
    }
    if (ratio >= 0.2 && ratio <= 0.8) {
      return 3;
    }
    return 1;
  });
}

export function chooseLargeBoardMiniOverlayCount(maxCount) {
  return chooseWeightedCount(Math.min(4, maxCount), (count) => {
    const weights = [4, 4, 3, 2, 1];
    return weights[count] ?? 1;
  });
}

export function chooseSmallBoardMiniOverlayCount(maxCount) {
  return chooseWeightedCount(Math.min(1, maxCount), (count) => {
    const weights = [4, 1];
    return weights[count] ?? 1;
  });
}

export function getPlacementSupportTiles(placement, pieceMap) {
  const piece = pieceMap[placement.pieceId];
  const supportTiles = new Set();

  for (const { x, y } of getFullRectOffsets(piece, placement.rotation ?? 0)) {
    supportTiles.add(`${placement.x + x},${placement.y + y}`);
  }

  return supportTiles;
}

export function getOverlayPlacementsForSupportTiles(overlayPiece, supportTiles, dockTiles) {
  const bounds = Array.from(supportTiles).map((key) => key.split(",").map(Number));
  if (!bounds.length) {
    return [];
  }

  const xs = bounds.map(([x]) => x);
  const ys = bounds.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const placements = [];

  for (const rotation of ROTATIONS) {
    const dims = rotatedDimensions(overlayPiece, rotation);
    const occupiedOffsets = isMiniOverlayPiece(overlayPiece)
      ? getPlacementOccupiedOffsets(overlayPiece, rotation)
      : getFullRectOffsets(overlayPiece, rotation);

    for (let y = minY; y <= maxY - dims.height + 1; y += 1) {
      for (let x = minX; x <= maxX - dims.width + 1; x += 1) {
        const valid = occupiedOffsets.every(({ x: dx, y: dy }) => {
          const key = `${x + dx},${y + dy}`;
          return supportTiles.has(key) && !dockTiles.has(key);
        });

        if (valid) {
          placements.push({
            pieceId: overlayPiece.id,
            x,
            y,
            rotation,
            overlay: true
          });
        }
      }
    }
  }

  return placements;
}

export function getBoardMiniOverlayTargets(structuralPlacements, boardOverlayPlacements, pieceMap) {
  const blankBoards = [];
  const otherBoards = [];

  for (const placement of [...boardOverlayPlacements, ...structuralPlacements]) {
    const piece = pieceMap[placement.pieceId];
    if (!piece) {
      continue;
    }

    if (isBlankCustomBoardPiece(piece)) {
      blankBoards.push(placement);
      continue;
    }

    otherBoards.push(placement);
  }

  return { blankBoards, otherBoards };
}

export function getTargetSupportTiles(targetPlacement, boardOverlayPlacements, pieceMap) {
  const supportTiles = getPlacementSupportTiles(targetPlacement, pieceMap);
  if (targetPlacement.overlay) {
    return supportTiles;
  }

  for (const overlayPlacement of boardOverlayPlacements) {
    for (const key of getPlacementOccupiedTiles(pieceMap[overlayPlacement.pieceId], overlayPlacement)) {
      supportTiles.delete(key);
    }
  }

  return supportTiles;
}

export function placementSuppresssTrackedHazard(placement, piece, currentTileMap) {
  return getPlacementOccupiedOffsets(piece, placement.rotation ?? 0).some(({ x, y }) => {
    const tile = currentTileMap.get(`${placement.x + x},${placement.y + y}`);
    return (tile?.features || []).some((feature) => (
      feature.type === "laser" || feature.type === "flamethrower"
    ));
  });
}

// Stable text for a square's features: key order and side order do not matter.
function canonicalFeatures(features = []) {
  const stable = (value) => {
    if (Array.isArray(value)) {
      const items = value.map(stable);
      return value.every((entry) => typeof entry === "string") ? `[${[...items].sort().join(",")}]` : `[${items.join(",")}]`;
    }
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${key}:${stable(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  };
  return features.map(stable).sort().join("|");
}

// A token that leaves every square it covers exactly as it was is not placed
// (user 2026-11-10). A token on the same feature still counts when anything
// else differs (walls, other features it replaces, extra features on it).
function pieceHasLaser(piece) {
  return (piece?.tiles || []).some((tile) => (tile.features || []).some((feature) => feature.type === "laser"));
}

export function placementChangesNothing(placement, piece, currentTileMap) {
  const own = buildResolvedMap([placement], { [placement.pieceId]: piece }).tileMap;
  for (const [key, tile] of own) {
    const current = currentTileMap.get(key)?.features ?? [];
    const after = piece.mergeMode === "add" ? [...current, ...(tile.features || [])] : (tile.features || []);
    if (canonicalFeatures(after) !== canonicalFeatures(current)) return false;
  }
  return true;
}

export function laserTileHasValidContinuation(tile, laser, candidateFeatureMap, currentTileMap, supportTiles) {
  const sideChecks = [laser.dir, getOppositeSide(laser.dir)];

  return sideChecks.every((side) => {
    const currentFeatures = tile.features || [];
    if (tileHasLaserSupportBlock(currentFeatures, side, { includeLowerLedge: true })) {
      return true;
    }

    const delta = CARDINAL_DIRS[side];
    const neighborX = tile.x + delta.dx;
    const neighborY = tile.y + delta.dy;
    const neighborKey = `${neighborX},${neighborY}`;
    if (!supportTiles.has(neighborKey)) {
      return !currentTileMap.has(neighborKey);
    }

    const neighborFeatures = candidateFeatureMap.get(neighborKey) ?? currentTileMap.get(neighborKey)?.features ?? [];
    if (tileHasLaserSupportBlock(neighborFeatures, getOppositeSide(side), { includeLowerLedge: false })) {
      return true;
    }

    return tileContinuesLaserBeam(neighborFeatures, laser);
  });
}

export function placementHasValidLaserSupport(placement, piece, currentTileMap, supportTiles, candidateFeatureMap = null) {
  const placed = placePiece(piece, placement);
  const effectiveFeatureMap = candidateFeatureMap ?? getPlacedTileFeatureMap(piece, placement);

  return placed.tiles.every((tile) => {
    const lasers = (tile.features || []).filter((feature) => feature.type === "laser");
    if (!lasers.length) {
      return true;
    }

    return lasers.every((laser) => laserTileHasValidContinuation(tile, laser, effectiveFeatureMap, currentTileMap, supportTiles));
  });
}

export function rotateBundleOffset(offset, length, rotation) {
  if (rotation === 90) {
    return { x: 0, y: offset };
  }
  if (rotation === 180) {
    return { x: length - 1 - offset, y: 0 };
  }
  if (rotation === 270) {
    return { x: 0, y: length - 1 - offset };
  }
  return { x: offset, y: 0 };
}

export function getAvailableLaserBundlePatterns(groupedMiniOverlayIds, maxTiles) {
  const patterns = [];

  LASER_BUNDLE_DEFINITIONS.forEach((definition) => {
    const hasStart = groupedMiniOverlayIds.has(definition.startPhysicalId);
    const hasMid = groupedMiniOverlayIds.has(definition.midPhysicalId);
    const hasEnd = groupedMiniOverlayIds.has(definition.endPhysicalId);

    if (hasStart && hasMid && hasEnd && maxTiles >= 3) {
      patterns.push({ ids: [definition.endId, definition.midId, definition.startId], weight: 5 });
    }
    if (hasStart && hasEnd && maxTiles >= 2) {
      patterns.push({ ids: [definition.endId, definition.startId], weight: 3 });
    }
    if (hasStart && hasMid && maxTiles >= 2) {
      patterns.push({ ids: [definition.midId, definition.startId], weight: 2 });
    }
    if (hasMid && hasEnd && maxTiles >= 2) {
      patterns.push({ ids: [definition.endId, definition.midId], weight: 2 });
    }
    if (hasMid && maxTiles >= 1) {
      patterns.push({ ids: [definition.midId], weight: 1 });
    }
  });

  return patterns;
}

export function sampleWeightedLaserBundle(patterns) {
  const bag = [];
  patterns.forEach((pattern) => {
    for (let copy = 0; copy < pattern.weight; copy += 1) {
      bag.push(pattern);
    }
  });
  return bag.length ? sample(bag) : null;
}

// True when adding `newPlacements` opens no laser beam end that was anchored
// before: compares the merged course map with and without them, so it also
// catches an overlay covering a beam or the wall a beam ends on.
export function placementsKeepLasersAnchored(newPlacements, currentPlacements, pieceMap) {
  const endKey = (end) => `${end.x},${end.y},${end.dir},${end.side}`;
  const before = new Set(
    findUnanchoredLaserEnds(buildResolvedMap(currentPlacements, pieceMap).tileMap).map(endKey)
  );
  const after = findUnanchoredLaserEnds(
    buildResolvedMap([...currentPlacements, ...newPlacements], pieceMap).tileMap
  );
  return after.every((end) => before.has(endKey(end)));
}

// Conveyor and pusher tokens must not point straight into a wall or another
// impassable edge (a building side without a doorway, a grandstand, a ledge
// from below, a wrong-way jump ramp); a pit or the course edge is fine (user
// 2026-10-30). Uses the movement step test on the merged course map, and
// checks the tokens already placed too (a new token can wall one in).
export function placementPointsIntoBlockedEdge(newPlacements, currentPlacements, pieceMap) {
  const { tileMap } = buildResolvedMap([...currentPlacements, ...newPlacements], pieceMap);
  const tokens = [
    ...newPlacements,
    ...currentPlacements.filter((placement) => placement.overlay && isMiniOverlayPiece(pieceMap[placement.pieceId]))
  ];
  return tokens.some((placement) => (
    placePiece(pieceMap[placement.pieceId], placement).tiles.some((tile) => (
      (tile.features || []).some((feature) => {
        if ((feature.type !== "belt" && feature.type !== "push") || !CARDINAL_DIRS[feature.dir]) {
          return false;
        }
        const delta = CARDINAL_DIRS[feature.dir];
        const step = canMoveBetween(
          tileMap,
          tile,
          { x: tile.x + delta.dx, y: tile.y + delta.dy },
          feature.dir,
          {},
          false
        );
        return !step.ok && !step.crash;
      })
    ))
  ));
}

// Samples like sample(), redrawing without a candidate that breaks a laser, so
// the random draw is unchanged whenever the first pick is legal.
function sampleKeepingLasersAnchored(candidates, keepsLasersAnchored) {
  let pool = candidates;
  while (pool.length) {
    const choice = sample(pool);
    if (keepsLasersAnchored(choice)) {
      return choice;
    }
    pool = pool.filter((candidate) => candidate !== choice);
  }
  return null;
}

// Closing tokens (user 2026-11-13): when new laser tokens leave a beam end open
// onto a free square of the same board, look for other tokens to put on those
// squares that anchor the beam (a wall facing it, or a same-strength laser
// end), as laser tokens already extend each other. Returns the closing
// placements ([] when nothing is open), or null when some end cannot be closed
// within `maxClosers` tokens. Space bridges never close a beam.
export function findLaserEndClosers(newPlacements, {
  pieceMap,
  groupedMiniOverlayIds,
  excludedPhysicalIds = new Set(),
  supportTiles,
  dockTiles,
  occupiedTiles,
  placementsSoFar,
  maxClosers
}) {
  const endKey = (end) => `${end.x},${end.y},${end.dir},${end.side}`;
  const openBefore = new Set(findUnanchoredLaserEnds(buildResolvedMap(placementsSoFar, pieceMap).tileMap).map(endKey));
  const newlyOpen = (extra) => findUnanchoredLaserEnds(
    buildResolvedMap([...placementsSoFar, ...newPlacements, ...extra], pieceMap).tileMap
  ).filter((end) => !openBefore.has(endKey(end)));
  const taken = new Set(occupiedTiles);
  newPlacements.forEach((placement) => getPlacementOccupiedTiles(pieceMap[placement.pieceId], placement).forEach((key) => taken.add(key)));
  const usedPhysical = new Set(excludedPhysicalIds);
  const closers = [];
  for (let guard = 0; guard <= maxClosers; guard += 1) {
    const open = newlyOpen(closers);
    if (!open.length) break;
    if (closers.length >= maxClosers) return null;
    const end = open[0];
    const delta = CARDINAL_DIRS[end.side];
    const targetKey = `${end.x + delta.dx},${end.y + delta.dy}`;
    if (!supportTiles.has(targetKey) || dockTiles.has(targetKey) || taken.has(targetKey)) return null;
    const currentTileMap = buildResolvedMap([...placementsSoFar, ...newPlacements, ...closers], pieceMap).tileMap;
    let closer = null;
    for (const [physicalId, overlayIds] of shuffle([...groupedMiniOverlayIds.entries()])) {
      if (usedPhysical.has(physicalId)) continue;
      for (const overlayId of shuffle([...overlayIds])) {
        const piece = pieceMap[overlayId];
        if (getSpaceBridgeColour(piece)) continue;
        for (const rotation of ROTATIONS) {
          for (const offset of getPlacementOccupiedOffsets(piece, rotation)) {
            const [tx, ty] = targetKey.split(",").map(Number);
            const placement = { pieceId: overlayId, x: tx - offset.x, y: ty - offset.y, rotation, overlay: true };
            const keys = getPlacementOccupiedTiles(piece, placement);
            if (!keys.every((key) => supportTiles.has(key) && !dockTiles.has(key) && !taken.has(key))) continue;
            if (placementSuppresssTrackedHazard(placement, piece, currentTileMap)) continue;
            if (placementChangesNothing(placement, piece, currentTileMap)) continue;
            if (newlyOpen([...closers, placement]).some((entry) => endKey(entry) === endKey(end))) continue;
            closer = { physicalId, placement };
            break;
          }
          if (closer) break;
        }
        if (closer) break;
      }
      if (closer) break;
    }
    if (!closer) return null;
    usedPhysical.add(closer.physicalId);
    getPlacementOccupiedTiles(pieceMap[closer.placement.pieceId], closer.placement).forEach((key) => taken.add(key));
    closers.push(closer.placement);
  }
  const all = [...newPlacements, ...closers];
  if (!placementsKeepLasersAnchored(all, placementsSoFar, pieceMap)) return null;
  if (placementPointsIntoBlockedEdge(all, placementsSoFar, pieceMap)) return null;
  return closers;
}

// Laser tokens that could only go where a beam end stays open are tried with
// closing tokens; at most this many positions per token, to bound the work,
// and one closer per beam end.
const LASER_CLOSER_PLACEMENT_TRIES = 12;
const LASER_CLOSERS_PER_PLACEMENT = 2;

export function tryPlaceLaserBundleOnBoard(groupedMiniOverlayIds, pieceMap, supportTiles, dockTiles, occupiedMiniOverlayTiles, currentTileMap, remainingSlots, currentPlacements) {
  // A laser and the tokens that extend or close it count as one placement
  // (user 2026-11-13), so the bundle length is not limited by the board's slots.
  const bundlePattern = sampleWeightedLaserBundle(getAvailableLaserBundlePatterns(groupedMiniOverlayIds, Infinity));
  if (!bundlePattern) {
    return null;
  }

  const bounds = Array.from(supportTiles).map((key) => key.split(",").map(Number));
  if (!bounds.length) {
    return null;
  }

  const xs = bounds.map(([x]) => x);
  const ys = bounds.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bundleLength = bundlePattern.ids.length;
  const candidateBundles = [];
  const openEndedBundles = [];

  for (const rotation of ROTATIONS) {
    const width = rotation === 90 || rotation === 270 ? 1 : bundleLength;
    const height = rotation === 90 || rotation === 270 ? bundleLength : 1;

    for (let y = minY; y <= maxY - height + 1; y += 1) {
      for (let x = minX; x <= maxX - width + 1; x += 1) {
        const placements = bundlePattern.ids.map((pieceId, index) => {
          const offset = rotateBundleOffset(index, bundleLength, rotation);
          return {
            pieceId,
            x: x + offset.x,
            y: y + offset.y,
            rotation,
            overlay: true
          };
        });

        const occupiedKeys = placements.flatMap((placement) => getPlacementOccupiedTiles(pieceMap[placement.pieceId], placement));
        if (!occupiedKeys.every((key) => supportTiles.has(key) && !dockTiles.has(key) && !occupiedMiniOverlayTiles.has(key))) {
          continue;
        }
        if (placements.some((placement) => (
          placementSuppresssTrackedHazard(placement, pieceMap[placement.pieceId], currentTileMap) ||
          placementChangesNothing(placement, pieceMap[placement.pieceId], currentTileMap)
        ))) {
          continue;
        }

        const candidateFeatureMap = getCombinedPlacedTileFeatureMap(placements, pieceMap);
        if (!placements.every((placement) => (
          placementHasValidLaserSupport(placement, pieceMap[placement.pieceId], currentTileMap, supportTiles, candidateFeatureMap)
        ))) {
          openEndedBundles.push(placements);
          continue;
        }

        candidateBundles.push(placements);
      }
    }
  }

  const anchored = candidateBundles.length
    ? sampleKeepingLasersAnchored(
      candidateBundles,
      (bundle) => placementsKeepLasersAnchored(bundle, currentPlacements, pieceMap)
    )
    : null;
  if (anchored) {
    return anchored;
  }

  // No bundle fits with both ends anchored: try ones whose open ends other
  // tokens can close (at most one per beam end).
  const bundlePhysicalIds = new Set(bundlePattern.ids.map((pieceId) => getPhysicalBoardId(pieceMap[pieceId])));
  for (const bundle of shuffle(openEndedBundles).slice(0, LASER_CLOSER_PLACEMENT_TRIES)) {
    const closers = findLaserEndClosers(bundle, {
      pieceMap,
      groupedMiniOverlayIds,
      excludedPhysicalIds: bundlePhysicalIds,
      supportTiles,
      dockTiles,
      occupiedTiles: occupiedMiniOverlayTiles,
      placementsSoFar: currentPlacements,
      maxClosers: LASER_CLOSERS_PER_PLACEMENT
    });
    if (closers) {
      return [...bundle, ...closers];
    }
  }
  return null;
}

export function placementTouchesSupportEdge(placement, piece, supportTiles) {
  return getPlacementOccupiedOffsets(piece, placement.rotation ?? 0).some(({ x, y }) => {
    const absoluteX = placement.x + x;
    const absoluteY = placement.y + y;
    return (
      !supportTiles.has(`${absoluteX},${absoluteY - 1}`) ||
      !supportTiles.has(`${absoluteX + 1},${absoluteY}`) ||
      !supportTiles.has(`${absoluteX},${absoluteY + 1}`) ||
      !supportTiles.has(`${absoluteX - 1},${absoluteY}`)
    );
  });
}

export function placementTouchesOccupiedNeighbors(placement, piece, occupiedOverlayTiles) {
  return getPlacementOccupiedOffsets(piece, placement.rotation ?? 0).some(({ x, y }) => {
    const absoluteX = placement.x + x;
    const absoluteY = placement.y + y;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        if (occupiedOverlayTiles.has(`${absoluteX + dx},${absoluteY + dy}`)) {
          return true;
        }
      }
    }
    return false;
  });
}

function getPlacedSpaceBridgeColours(placements, pieceMap) {
  const colours = new Set();
  for (const placement of placements) {
    const colour = getSpaceBridgeColour(pieceMap[placement.pieceId]);
    if (colour) colours.add(colour);
  }
  return colours;
}

function getSpaceBridgePartnerGroups(groupedMiniOverlayIds, pieceMap, excludedPhysicalBoardId, colour) {
  return [...groupedMiniOverlayIds.entries()].filter(([physicalBoardId, overlayIds]) => (
    physicalBoardId !== excludedPhysicalBoardId &&
    overlayIds.some((overlayId) => getSpaceBridgeColour(pieceMap[overlayId]) === colour)
  ));
}

export function placeMiniOverlaysOnBoards(targetBoards, groupedMiniOverlayIds, pieceMap, dockPlacements, occupiedMiniOverlayTiles, countChooser, currentPlacements, boardOverlayPlacements) {
  const dockTiles = getDockTileKeySet(dockPlacements, pieceMap);
  const placements = [];
  let currentTileMap = buildResolvedMap(currentPlacements, pieceMap).tileMap;

  for (const targetPlacement of targetBoards) {
    const remainingGroups = [...groupedMiniOverlayIds.entries()];
    if (!remainingGroups.length) {
      break;
    }

    const targetCount = countChooser(remainingGroups.length, targetPlacement);
    if (targetCount <= 0) {
      continue;
    }

    const supportTiles = getTargetSupportTiles(targetPlacement, boardOverlayPlacements, pieceMap);
    if (!supportTiles.size) {
      continue;
    }
    const targetPiece = pieceMap[targetPlacement.pieceId];
    const allowDensePacking = isBlankCustomBoardPiece(targetPiece);

    for (let placedCount = 0; placedCount < targetCount;) {
      let placed = false;
      const remainingSlots = targetCount - placedCount;
      const laserBundlePlacements = tryPlaceLaserBundleOnBoard(
        groupedMiniOverlayIds,
        pieceMap,
        supportTiles,
        dockTiles,
        occupiedMiniOverlayTiles,
        currentTileMap,
        remainingSlots,
        currentPlacements
      );
      if (laserBundlePlacements?.length) {
        laserBundlePlacements.forEach((placement) => {
          getPlacementOccupiedTiles(pieceMap[placement.pieceId], placement).forEach((key) => occupiedMiniOverlayTiles.add(key));
          placements.push(placement);
          currentPlacements.push(placement);
          groupedMiniOverlayIds.delete(getPhysicalBoardId(pieceMap[placement.pieceId]));
        });
        currentTileMap = buildResolvedMap(currentPlacements, pieceMap).tileMap;
        // The laser with its extending and closing tokens is one placement.
        placedCount += 1;
        continue;
      }

      const chooseTokenPlacement = (
        overlayPiece,
        tileMap,
        occupiedTiles,
        placementsSoFar,
        boardSupportTiles = supportTiles,
        boardAllowsDensePacking = allowDensePacking
      ) => {
        const legalPlacements = shuffle(
          getOverlayPlacementsForSupportTiles(overlayPiece, boardSupportTiles, dockTiles)
        ).filter((placement) => {
          if (!getPlacementOccupiedTiles(overlayPiece, placement).every((key) => !occupiedTiles.has(key))) {
            return false;
          }
          if (placementSuppresssTrackedHazard(placement, overlayPiece, tileMap)) {
            return false;
          }
          if (placementChangesNothing(placement, overlayPiece, tileMap)) {
            return false;
          }
          if (!placementHasValidLaserSupport(placement, overlayPiece, tileMap, boardSupportTiles)) {
            return false;
          }
          return true;
        });

        if (!legalPlacements.length) {
          return null;
        }

        const preferredPlacements = boardAllowsDensePacking
          ? legalPlacements
          : legalPlacements.filter((placement) => (
            !placementTouchesSupportEdge(placement, overlayPiece, boardSupportTiles) &&
            !placementTouchesOccupiedNeighbors(placement, overlayPiece, occupiedTiles)
          ));
        const fallbackPlacements = boardAllowsDensePacking
          ? legalPlacements
          : legalPlacements.filter((placement) => (
            !placementTouchesOccupiedNeighbors(placement, overlayPiece, occupiedTiles)
          ));
        const candidatePlacements = preferredPlacements.length
          ? preferredPlacements
          : (fallbackPlacements.length ? fallbackPlacements : legalPlacements);
        return [
          ...candidatePlacements,
          ...legalPlacements.filter((placement) => !candidatePlacements.includes(placement))
        ].find((placement) => (
          placementsKeepLasersAnchored([placement], placementsSoFar, pieceMap) &&
          !placementPointsIntoBlockedEdge([placement], placementsSoFar, pieceMap)
        )) || null;
      };
      const placeLaserTokenWithClosers = (physicalBoardId, overlayPiece, maxClosers) => {
        const openEnded = shuffle(
          getOverlayPlacementsForSupportTiles(overlayPiece, supportTiles, dockTiles)
        ).filter((placement) => (
          getPlacementOccupiedTiles(overlayPiece, placement).every((key) => !occupiedMiniOverlayTiles.has(key)) &&
          !placementSuppresssTrackedHazard(placement, overlayPiece, currentTileMap) &&
          !placementChangesNothing(placement, overlayPiece, currentTileMap) &&
          !placementHasValidLaserSupport(placement, overlayPiece, currentTileMap, supportTiles)
        )).slice(0, LASER_CLOSER_PLACEMENT_TRIES);
        for (const placement of openEnded) {
          const closers = findLaserEndClosers([placement], {
            pieceMap,
            groupedMiniOverlayIds,
            excludedPhysicalIds: new Set([physicalBoardId]),
            supportTiles,
            dockTiles,
            occupiedTiles: occupiedMiniOverlayTiles,
            placementsSoFar: currentPlacements,
            maxClosers
          });
          if (closers?.length) return { placement, closers };
        }
        return null;
      };
      const commitTokenPlacement = (physicalBoardId, overlayPiece, placement, countsOnThisBoard = true) => {
        getPlacementOccupiedTiles(overlayPiece, placement).forEach((key) => occupiedMiniOverlayTiles.add(key));
        placements.push(placement);
        currentPlacements.push(placement);
        groupedMiniOverlayIds.delete(physicalBoardId);
        if (countsOnThisBoard) placedCount += 1;
      };

      for (const [physicalBoardId, overlayIds] of shuffle([...groupedMiniOverlayIds.entries()])) {
        // Space bridges (Transformers, user rules 2026-11-03/04): a bridge
        // whose colour is not yet on the course comes with a second bridge of
        // that colour, from another physical token, anywhere on the course
        // (any target board, this one included); if no partner fits, the
        // bridge is not placed and another token is tried.
        const placedBridgeColours = getPlacedSpaceBridgeColours(currentPlacements, pieceMap);
        const viableOverlayIds = overlayIds.filter((overlayId) => {
          const colour = getSpaceBridgeColour(pieceMap[overlayId]);
          if (!colour || placedBridgeColours.has(colour)) return true;
          return getSpaceBridgePartnerGroups(groupedMiniOverlayIds, pieceMap, physicalBoardId, colour).length > 0;
        });
        if (!viableOverlayIds.length) {
          continue;
        }
        const chosenOverlayId = sample(viableOverlayIds);
        const overlayPiece = pieceMap[chosenOverlayId];
        const chosenPlacement = chooseTokenPlacement(overlayPiece, currentTileMap, occupiedMiniOverlayTiles, currentPlacements);
        if (!chosenPlacement) {
          // A laser token that fits only with an open beam end: close the end
          // with other tokens when the board has slots for them.
          const withClosers = pieceHasLaser(overlayPiece)
            ? placeLaserTokenWithClosers(physicalBoardId, overlayPiece, LASER_CLOSERS_PER_PLACEMENT)
            : null;
          if (!withClosers) {
            continue;
          }
          commitTokenPlacement(physicalBoardId, overlayPiece, withClosers.placement);
          // Closers belong to the laser's placement: no extra slot.
          withClosers.closers.forEach((closer) => {
            commitTokenPlacement(getPhysicalBoardId(pieceMap[closer.pieceId]), pieceMap[closer.pieceId], closer, false);
          });
          currentTileMap = buildResolvedMap(currentPlacements, pieceMap).tileMap;
          placed = true;
          break;
        }

        const bridgeColour = getSpaceBridgeColour(overlayPiece);
        if (bridgeColour && !placedBridgeColours.has(bridgeColour)) {
          const withFirst = [...currentPlacements, chosenPlacement];
          const occupiedWithFirst = new Set(occupiedMiniOverlayTiles);
          getPlacementOccupiedTiles(overlayPiece, chosenPlacement).forEach((key) => occupiedWithFirst.add(key));
          const tileMapWithFirst = buildResolvedMap(withFirst, pieceMap).tileMap;
          // The partner may sit on any target board; this board only while it
          // still has a slot for it.
          const partnerBoards = shuffle(targetBoards.filter((board) => (
            board !== targetPlacement || remainingSlots >= 2
          )));
          let partner = null;
          for (const [partnerBoardId, partnerIds] of shuffle(
            getSpaceBridgePartnerGroups(groupedMiniOverlayIds, pieceMap, physicalBoardId, bridgeColour)
          )) {
            const partnerPiece = pieceMap[partnerIds.find((overlayId) => getSpaceBridgeColour(pieceMap[overlayId]) === bridgeColour)];
            for (const partnerBoard of partnerBoards) {
              const onThisBoard = partnerBoard === targetPlacement;
              const partnerSupportTiles = onThisBoard
                ? supportTiles
                : getTargetSupportTiles(partnerBoard, boardOverlayPlacements, pieceMap);
              if (!partnerSupportTiles.size) continue;
              const partnerPlacement = chooseTokenPlacement(
                partnerPiece,
                tileMapWithFirst,
                occupiedWithFirst,
                withFirst,
                partnerSupportTiles,
                onThisBoard ? allowDensePacking : isBlankCustomBoardPiece(pieceMap[partnerBoard.pieceId])
              );
              if (partnerPlacement) {
                partner = { physicalBoardId: partnerBoardId, piece: partnerPiece, placement: partnerPlacement, onThisBoard };
                break;
              }
            }
            if (partner) break;
          }
          if (!partner) {
            continue;
          }
          commitTokenPlacement(physicalBoardId, overlayPiece, chosenPlacement);
          commitTokenPlacement(partner.physicalBoardId, partner.piece, partner.placement, partner.onThisBoard);
        } else {
          commitTokenPlacement(physicalBoardId, overlayPiece, chosenPlacement);
        }
        currentTileMap = buildResolvedMap(currentPlacements, pieceMap).tileMap;
        placed = true;
        break;
      }

      if (!placed) {
        break;
      }
    }
  }

  return placements;
}

export function getBoardOverlayCount(preferences, largeBoardCount, maxAvailable) {
  // This difficulty-conditioned envelope is intentionally NOT a gameplay-RE
  // modifier. Structural overlays can feel visually/intimidatingly advanced to
  // newer or infrequent players even when their actual mechanics make a route
  // easier. Keep this as a pre-game presentation policy; once an overlay is
  // placed, its normal board mechanics exclusively own gameplay consequences.
  if (preferences.difficulty === "easy") {
    return 0;
  }

  const maxByDifficulty = preferences.difficulty === "moderate"
    ? Math.max(0, largeBoardCount - 1)
    : largeBoardCount;
  const maxCount = Math.min(maxAvailable, maxByDifficulty);
  if (maxCount <= 0) {
    return 0;
  }

  // Calibration can request an exact structural-overlay treatment, but it still
  // respects the production difficulty/count envelope above. Browser generation
  // never supplies this internal preference and therefore keeps the same random
  // overlay-count distribution.
  const calibrationBoardOverlayCount = preferences.calibrationBoardOverlayCount == null
    ? NaN
    : Number(preferences.calibrationBoardOverlayCount);
  if (Number.isInteger(calibrationBoardOverlayCount) && calibrationBoardOverlayCount >= 0) {
    return Math.min(calibrationBoardOverlayCount, maxCount);
  }

  const choices = [];
  for (let count = 0; count <= maxCount; count += 1) {
    const copies = count === 0
      ? (preferences.difficulty === "moderate" ? 3 : 2)
      : 1;
    for (let copy = 0; copy < copies; copy += 1) {
      choices.push(count);
    }
  }

  return sample(choices);
}

export function getLegalOverlayPlacements(overlayPiece, structuralPlacements, dockPlacements, pieceMap) {
  return getOverlayPlacementsForSupportTiles(
    overlayPiece,
    buildMainFootprintTiles(structuralPlacements, pieceMap),
    getDockTileKeySet(dockPlacements, pieceMap)
  );
}

export function getAlignedEdgeOffsets(anchorStart, anchorLength, candidateLength) {
  if (anchorLength === candidateLength) {
    return [anchorStart];
  }

  if (candidateLength < anchorLength) {
    const slack = anchorLength - candidateLength;
    return [...new Set([
      anchorStart,
      anchorStart + Math.floor(slack / 2),
      anchorStart + slack
    ])];
  }

  const slack = candidateLength - anchorLength;
  return [...new Set([
    anchorStart - slack,
    anchorStart - Math.floor(slack / 2),
    anchorStart
  ])];
}

export function getAlignedOverlayPlacements(overlayPiece, structuralPlacements, dockPlacements, pieceMap) {
  if (overlayPiece.width !== 6 || overlayPiece.height !== 6) {
    return getLegalOverlayPlacements(overlayPiece, structuralPlacements, dockPlacements, pieceMap);
  }

  const dockTiles = getDockTileKeySet(dockPlacements, pieceMap);
  const placements = [];

  for (const basePlacement of structuralPlacements) {
    const basePiece = pieceMap[basePlacement.pieceId];
    const dims = rotatedDimensions(basePiece, basePlacement.rotation ?? 0);
    if (dims.width !== 12 || dims.height !== 12) {
      continue;
    }

    const anchors = [
      { dx: 0, dy: 0 },
      { dx: 6, dy: 0 },
      { dx: 0, dy: 6 },
      { dx: 6, dy: 6 },
      { dx: 3, dy: 3 }
    ];

    for (const rotation of ROTATIONS) {
      for (const anchor of anchors) {
        const placement = {
          pieceId: overlayPiece.id,
          x: basePlacement.x + anchor.dx,
          y: basePlacement.y + anchor.dy,
          rotation,
          overlay: true
        };

        let valid = true;
        for (let dy = 0; dy < 6 && valid; dy += 1) {
          for (let dx = 0; dx < 6; dx += 1) {
            if (dockTiles.has(`${placement.x + dx},${placement.y + dy}`)) {
              valid = false;
              break;
            }
          }
        }

        if (valid) {
          placements.push(placement);
        }
      }
    }
  }

  return placements;
}

export function chooseOverlayPlacements(structuralPlacements, dockPlacements, pieceMap, preferences, expansionIds) {
  if (normalizeOverlayMode(preferences.overlayMode) === OVERLAY_MODES.no) {
    return [];
  }

  const usedStructuralBoards = new Set(
    structuralPlacements.map((placement) => getPhysicalBoardId(pieceMap[placement.pieceId]))
  );
  const overlayIds = getAvailableOverlayIds(pieceMap, expansionIds);
  const miniOverlayIds = shouldUseMiniOverlays(preferences)
    ? overlayIds.filter((overlayId) => isMiniOverlayPiece(pieceMap[overlayId]))
    : [];
  const boardOverlayIds = shouldUseBoardOverlays(preferences)
    ? overlayIds.filter((overlayId) => (
      !isMiniOverlayPiece(pieceMap[overlayId]) &&
      !usedStructuralBoards.has(getPhysicalBoardId(pieceMap[overlayId]))
    ))
    : [];

  const largeBoardCount = structuralPlacements.filter((placement) => {
    const piece = pieceMap[placement.pieceId];
    return Math.max(piece?.width ?? 0, piece?.height ?? 0) >= 12;
  }).length;
  const groupedBoardOverlays = new Map();
  for (const overlayId of boardOverlayIds) {
    const physicalBoardId = getPhysicalBoardId(pieceMap[overlayId]);
    if (!groupedBoardOverlays.has(physicalBoardId)) {
      groupedBoardOverlays.set(physicalBoardId, []);
    }
    groupedBoardOverlays.get(physicalBoardId).push(overlayId);
  }

  const placements = [];
  const occupiedBoardOverlayTiles = new Set();
  const occupiedMiniOverlayTiles = new Set();
  const currentPlacements = [
    ...structuralPlacements,
    ...dockPlacements
  ];
  const boardOverlayPlacements = [];

  const targetBoardOverlayCount = getBoardOverlayCount(preferences, largeBoardCount, groupedBoardOverlays.size);
  const calibrationBoardOverlayCount = preferences.calibrationBoardOverlayCount == null
    ? NaN
    : Number(preferences.calibrationBoardOverlayCount);
  const calibrationForcesBoardOverlays = Number.isInteger(calibrationBoardOverlayCount) && calibrationBoardOverlayCount >= 0;
  const boardOverlayGroups = shuffle([...groupedBoardOverlays.values()]);
  const groupsToTry = calibrationForcesBoardOverlays
    ? boardOverlayGroups
    : boardOverlayGroups.slice(0, targetBoardOverlayCount);

  for (const groupOverlayIds of groupsToTry) {
    if (calibrationForcesBoardOverlays && boardOverlayPlacements.length >= targetBoardOverlayCount) {
      break;
    }

    const candidateOverlayIds = calibrationForcesBoardOverlays
      ? shuffle(groupOverlayIds)
      : [sample(groupOverlayIds)];
    let chosenPlacement = null;
    let chosenOverlayPiece = null;

    for (const chosenOverlayId of candidateOverlayIds) {
      const overlayPiece = pieceMap[chosenOverlayId];
      const legalPlacements = (
        preferences.alignedLayout
          ? getAlignedOverlayPlacements(overlayPiece, structuralPlacements, dockPlacements, pieceMap)
          : getLegalOverlayPlacements(overlayPiece, structuralPlacements, dockPlacements, pieceMap)
      ).filter((placement) => (
        getPlacementOccupiedTiles(overlayPiece, placement).every((key) => !occupiedBoardOverlayTiles.has(key))
      ));
      if (!legalPlacements.length) {
        continue;
      }
      chosenPlacement = sampleKeepingLasersAnchored(
        legalPlacements,
        (placement) => placementsKeepLasersAnchored([placement], currentPlacements, pieceMap)
      );
      if (!chosenPlacement) {
        continue;
      }
      chosenOverlayPiece = overlayPiece;
      break;
    }

    if (!chosenPlacement || !chosenOverlayPiece) {
      continue;
    }

    getPlacementOccupiedTiles(chosenOverlayPiece, chosenPlacement).forEach((key) => occupiedBoardOverlayTiles.add(key));
    placements.push(chosenPlacement);
    boardOverlayPlacements.push(chosenPlacement);
    currentPlacements.push(chosenPlacement);
  }

  const groupedMiniOverlays = new Map();
  for (const overlayId of miniOverlayIds) {
    const physicalBoardId = getPhysicalBoardId(pieceMap[overlayId]);
    if (!groupedMiniOverlays.has(physicalBoardId)) {
      groupedMiniOverlays.set(physicalBoardId, []);
    }
    groupedMiniOverlays.get(physicalBoardId).push(overlayId);
  }

  const { blankBoards, otherBoards } = getBoardMiniOverlayTargets(structuralPlacements, boardOverlayPlacements, pieceMap);
  placements.push(...placeMiniOverlaysOnBoards(
    shuffle(blankBoards),
    groupedMiniOverlays,
    pieceMap,
    dockPlacements,
    occupiedMiniOverlayTiles,
    (maxCount) => chooseBlankBoardMiniOverlayCount(maxCount),
    currentPlacements,
    boardOverlayPlacements
  ));

  placements.push(...placeMiniOverlaysOnBoards(
    shuffle(otherBoards.filter((placement) => {
      const piece = pieceMap[placement.pieceId];
      return Math.max(piece?.width ?? 0, piece?.height ?? 0) >= 12;
    })),
    groupedMiniOverlays,
    pieceMap,
    dockPlacements,
    occupiedMiniOverlayTiles,
    (maxCount) => chooseLargeBoardMiniOverlayCount(maxCount),
    currentPlacements,
    boardOverlayPlacements
  ));

  placements.push(...placeMiniOverlaysOnBoards(
    shuffle(otherBoards.filter((placement) => {
      const piece = pieceMap[placement.pieceId];
      return Math.max(piece?.width ?? 0, piece?.height ?? 0) < 12;
    })),
    groupedMiniOverlays,
    pieceMap,
    dockPlacements,
    occupiedMiniOverlayTiles,
    (maxCount) => chooseSmallBoardMiniOverlayCount(maxCount),
    currentPlacements,
    boardOverlayPlacements
  ));

  return placements;
}
