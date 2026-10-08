// Robo Rally Course Randomizer - overlays: mini overlay tiles, laser bundles and structural board overlays
import {
  buildMainFootprintTiles,
  buildResolvedMap,
  placePiece,
  rotatedDimensions
} from "../../board.js";
import { CARDINAL_DIRS, LASER_BUNDLE_DEFINITIONS, ROTATIONS } from "./config.js";
import {
  getCombinedPlacedTileFeatureMap,
  getDockTileKeySet,
  getFullRectOffsets,
  getOppositeSide,
  getPhysicalBoardId,
  getPlacedTileFeatureMap,
  getPlacementOccupiedOffsets,
  getPlacementOccupiedTiles,
  isBlankCustomBoardPiece,
  isMiniOverlayPiece,
  tileHasLaserInDirection,
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

    return tileHasLaserInDirection(neighborFeatures, laser.dir);
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

export function tryPlaceLaserBundleOnBoard(groupedMiniOverlayIds, pieceMap, supportTiles, dockTiles, occupiedMiniOverlayTiles, currentTileMap, remainingSlots) {
  const bundlePattern = sampleWeightedLaserBundle(getAvailableLaserBundlePatterns(groupedMiniOverlayIds, remainingSlots));
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
        if (placements.some((placement) => placementSuppresssTrackedHazard(placement, pieceMap[placement.pieceId], currentTileMap))) {
          continue;
        }

        const candidateFeatureMap = getCombinedPlacedTileFeatureMap(placements, pieceMap);
        if (!placements.every((placement) => (
          placementHasValidLaserSupport(placement, pieceMap[placement.pieceId], currentTileMap, supportTiles, candidateFeatureMap)
        ))) {
          continue;
        }

        candidateBundles.push(placements);
      }
    }
  }

  if (!candidateBundles.length) {
    return null;
  }

  return sample(candidateBundles);
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
        remainingSlots
      );
      if (laserBundlePlacements?.length) {
        laserBundlePlacements.forEach((placement) => {
          getPlacementOccupiedTiles(pieceMap[placement.pieceId], placement).forEach((key) => occupiedMiniOverlayTiles.add(key));
          placements.push(placement);
          currentPlacements.push(placement);
          groupedMiniOverlayIds.delete(getPhysicalBoardId(pieceMap[placement.pieceId]));
        });
        currentTileMap = buildResolvedMap(currentPlacements, pieceMap).tileMap;
        placedCount += laserBundlePlacements.length;
        continue;
      }

      for (const [physicalBoardId, overlayIds] of shuffle([...groupedMiniOverlayIds.entries()])) {
        const chosenOverlayId = sample(overlayIds);
        const overlayPiece = pieceMap[chosenOverlayId];
        const legalPlacements = shuffle(
          getOverlayPlacementsForSupportTiles(overlayPiece, supportTiles, dockTiles)
        ).filter((placement) => {
          if (!getPlacementOccupiedTiles(overlayPiece, placement).every((key) => !occupiedMiniOverlayTiles.has(key))) {
            return false;
          }
          if (placementSuppresssTrackedHazard(placement, overlayPiece, currentTileMap)) {
            return false;
          }
          if (!placementHasValidLaserSupport(placement, overlayPiece, currentTileMap, supportTiles)) {
            return false;
          }
          return true;
        });

        if (!legalPlacements.length) {
          continue;
        }

        const preferredPlacements = allowDensePacking
          ? legalPlacements
          : legalPlacements.filter((placement) => (
            !placementTouchesSupportEdge(placement, overlayPiece, supportTiles) &&
            !placementTouchesOccupiedNeighbors(placement, overlayPiece, occupiedMiniOverlayTiles)
          ));
        const fallbackPlacements = allowDensePacking
          ? legalPlacements
          : legalPlacements.filter((placement) => (
            !placementTouchesOccupiedNeighbors(placement, overlayPiece, occupiedMiniOverlayTiles)
          ));
        const candidatePlacements = preferredPlacements.length
          ? preferredPlacements
          : (fallbackPlacements.length ? fallbackPlacements : legalPlacements);
        const chosenPlacement = candidatePlacements[0];
        getPlacementOccupiedTiles(overlayPiece, chosenPlacement).forEach((key) => occupiedMiniOverlayTiles.add(key));
        placements.push(chosenPlacement);
        currentPlacements.push(chosenPlacement);
        currentTileMap = buildResolvedMap(currentPlacements, pieceMap).tileMap;
        groupedMiniOverlayIds.delete(physicalBoardId);
        placedCount += 1;
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
      chosenPlacement = sample(legalPlacements);
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
