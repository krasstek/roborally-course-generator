// Robo Rally Course Randomizer - board layout: board placement and bridges, aligned attachment, docks and Sandwiched Dock
import {
  buildMainFootprintTiles,
  getBoundaryEdges,
  getDockFrontageLength,
  getPlacedRect,
  getValidDockRuns,
  groupBoundaryRuns,
  projectDockPlacement,
  rotatedDimensions,
  validateDockPlacement,
  validateMainBoardLayout
} from "../../board.js";
import {
  getMinimumBoardCountForConstructionRequirements,
  selectBoardIdsForCourse
} from "./board-selection.js";
import { DOCK_BRIDGE_GAP, DOCK_SIDES, MIN_SHARED_EDGE, ROTATIONS } from "./config.js";
import { getCalibratedConstructionPlan } from "./construction-guidance.js";
import {
  countConnectedComponents,
  countPhysicalBoards,
  isBlankCustomBoardPiece,
  isSmallBoardLayoutAcceptable,
  pointOnPlacement,
  pointOnRect
} from "./layout-geometry.js";
import { getAlignedEdgeOffsets } from "./overlays.js";
import { shouldUseMiniOverlays } from "./preferences.js";
import { generationRandom, sample, shuffle } from "./random.js";
import { getAvailableMainBoardIds, neutralBoardCount } from "./variant-availability.js";

export function boardIdsCanSupportDock(boardIds, pieceMap, dockPieceId) {
  const dockPiece = pieceMap[dockPieceId];
  if (!dockPiece) {
    return false;
  }

  const totalSpanCapacity = boardIds.reduce((sum, boardId) => {
    const piece = pieceMap[boardId];
    return sum + Math.max(piece?.width ?? 0, piece?.height ?? 0);
  }, 0);

  return totalSpanCapacity >= getDockFrontageLength(dockPiece);
}

export function createAlignedAttachedBoardPlacements(anchorPlacement, anchorPiece, pieceId, piece, side, rotation) {
  const dims = rotatedDimensions(piece, rotation);
  const anchorDims = rotatedDimensions(anchorPiece, anchorPlacement.rotation ?? 0);
  const placements = [];

  if (side === "left" || side === "right") {
    const yOffsets = getAlignedEdgeOffsets(anchorPlacement.y, anchorDims.height, dims.height);
    const x = side === "left"
      ? anchorPlacement.x - dims.width
      : anchorPlacement.x + anchorDims.width;

    for (const y of yOffsets) {
      placements.push({ pieceId, x, y, rotation });
    }

    return placements;
  }

  const xOffsets = getAlignedEdgeOffsets(anchorPlacement.x, anchorDims.width, dims.width);
  const y = side === "top"
    ? anchorPlacement.y - dims.height
    : anchorPlacement.y + anchorDims.height;

  for (const x of xOffsets) {
    placements.push({ pieceId, x, y, rotation });
  }

  return placements;
}

export function getAttachmentRange(anchorPlacement, anchorPiece, candidatePiece, candidateRotation, side, minSharedEdge = MIN_SHARED_EDGE) {
  const anchorDims = rotatedDimensions(anchorPiece, anchorPlacement.rotation ?? 0);
  const candidateDims = rotatedDimensions(candidatePiece, candidateRotation);

  if (side === "left" || side === "right") {
    return {
      min: anchorPlacement.y - candidateDims.height + minSharedEdge,
      max: anchorPlacement.y + anchorDims.height - minSharedEdge
    };
  }

  return {
    min: anchorPlacement.x - candidateDims.width + minSharedEdge,
    max: anchorPlacement.x + anchorDims.width - minSharedEdge
  };
}

export function createAttachedBoardPlacement(anchorPlacement, anchorPiece, pieceId, piece, side, rotation) {
  const dims = rotatedDimensions(piece, rotation);
  const anchorDims = rotatedDimensions(anchorPiece, anchorPlacement.rotation ?? 0);
  const range = getAttachmentRange(anchorPlacement, anchorPiece, piece, rotation, side);

  if (range.max < range.min) {
    return null;
  }

  const offset = range.min + Math.floor(generationRandom() * (range.max - range.min + 1));

  if (side === "left") {
    return { pieceId, x: anchorPlacement.x - dims.width, y: offset, rotation };
  }

  if (side === "right") {
    return { pieceId, x: anchorPlacement.x + anchorDims.width, y: offset, rotation };
  }

  if (side === "top") {
    return { pieceId, x: offset, y: anchorPlacement.y - dims.height, rotation };
  }

  return { pieceId, x: offset, y: anchorPlacement.y + anchorDims.height, rotation };
}

export function createBridgeBoardPlacement(anchorPlacement, anchorPiece, pieceId, piece, side, rotation, dockPiece) {
  const dims = rotatedDimensions(piece, rotation);
  const anchorDims = rotatedDimensions(anchorPiece, anchorPlacement.rotation ?? 0);
  const range = getAttachmentRange(anchorPlacement, anchorPiece, piece, rotation, side, Math.max(dockPiece.width, dockPiece.height));

  if (range.max < range.min) {
    return null;
  }

  const offset = range.min + Math.floor(generationRandom() * (range.max - range.min + 1));

  if (side === "left") {
    return { pieceId, x: anchorPlacement.x - dims.width - DOCK_BRIDGE_GAP, y: offset, rotation };
  }

  if (side === "right") {
    return { pieceId, x: anchorPlacement.x + anchorDims.width + DOCK_BRIDGE_GAP, y: offset, rotation };
  }

  if (side === "top") {
    return { pieceId, x: offset, y: anchorPlacement.y - dims.height - DOCK_BRIDGE_GAP, rotation };
  }

  return { pieceId, x: offset, y: anchorPlacement.y + anchorDims.height + DOCK_BRIDGE_GAP, rotation };
}

export function findBridgeDockPlacement(structuralPlacements, pieceMap, dockPieceId, dockFlipped) {
  const dock = pieceMap[dockPieceId];
  const footprintTiles = buildMainFootprintTiles(structuralPlacements, pieceMap);
  const boundaryRuns = getValidDockRuns(groupBoundaryRuns(getBoundaryEdges(footprintTiles)), dock);
  const dockFrontageLength = getDockFrontageLength(dock);
  const candidates = [];

  for (const run of boundaryRuns) {
    const oppositeSide = { E: "W", W: "E", N: "S", S: "N" }[run.side];

    for (const other of boundaryRuns) {
      if (other === run || other.side !== oppositeSide || other.orientation !== run.orientation) {
        continue;
      }

      if (Math.abs(other.line - run.line) !== DOCK_BRIDGE_GAP) {
        continue;
      }

      const overlapStart = Math.max(run.start, other.start);
      const overlapEnd = Math.min(run.end, other.end);
      if (overlapEnd - overlapStart < dockFrontageLength) {
        continue;
      }

      const preferredRun = run.side === "E" || run.side === "S" ? run : other;
      const offset = overlapStart - preferredRun.start;
      const dockPlacement = projectDockPlacement(preferredRun, offset, dock, dockFlipped);
      const dockValidation = validateDockPlacement(dockPlacement, structuralPlacements, pieceMap, footprintTiles);

      if (dockValidation.valid) {
        candidates.push({
          dockPlacement,
          dockValidation,
          boundaryRun: preferredRun
        });
      }
    }
  }

  return candidates.length ? sample(candidates) : null;
}

// Sandwiched Dock used to work with the legacy bridge helper above. Keep that
// path untouched and use this separate helper only for additional docks on a
// sandwich layout, whose factory boards are intentionally disconnected.
export function canBridgeDisconnectedLayout(structuralPlacements, pieceMap, dockPieceId) {
  return Boolean(
    findBridgeDockPlacement(structuralPlacements, pieceMap, dockPieceId, false) ||
    findBridgeDockPlacement(structuralPlacements, pieceMap, dockPieceId, true)
  );
}

export function tryExtendBoardLayout(existingPlacements, nextBoardId, pieceMap, dockPieceId, allowDockBridge = false, options = {}) {
  const nextBoard = pieceMap[nextBoardId];
  const dock = pieceMap[dockPieceId];
  const anchorIndices = shuffle(existingPlacements.map((_, index) => index));

  for (const anchorIndex of anchorIndices) {
    const anchorPlacement = existingPlacements[anchorIndex];
    const anchorPiece = pieceMap[anchorPlacement.pieceId];

    if (!options.bridgeOnly) {
    for (const side of shuffle(DOCK_SIDES)) {
      for (const rotation of shuffle(ROTATIONS)) {
        const nextPlacement = createAttachedBoardPlacement(anchorPlacement, anchorPiece, nextBoardId, nextBoard, side, rotation);
        if (!nextPlacement) {
          continue;
        }

        const candidatePlacements = [...existingPlacements, nextPlacement];
        const validation = validateMainBoardLayout(candidatePlacements, pieceMap, {
          minSharedEdge: MIN_SHARED_EDGE
        });

        if (validation.valid) {
          return {
            placements: candidatePlacements,
            layoutValidation: validation
          };
        }

        if (allowDockBridge && validation.errors.length === 1 && validation.errors[0] === "disconnected-layout") {
          if (countConnectedComponents(validation.graph) === 2 && canBridgeDisconnectedLayout(candidatePlacements, pieceMap, dockPieceId)) {
            return {
              placements: candidatePlacements,
              layoutValidation: validation
            };
          }
        }
      }
    }

    }

    if (!allowDockBridge) {
      continue;
    }

    for (const side of shuffle(DOCK_SIDES)) {
      for (const rotation of shuffle(ROTATIONS)) {
        const nextPlacement = createBridgeBoardPlacement(anchorPlacement, anchorPiece, nextBoardId, nextBoard, side, rotation, dock);
        if (!nextPlacement) {
          continue;
        }

        const candidatePlacements = [...existingPlacements, nextPlacement];
        const validation = validateMainBoardLayout(candidatePlacements, pieceMap, {
          minSharedEdge: MIN_SHARED_EDGE
        });

        if (validation.errors.length === 1 && validation.errors[0] === "disconnected-layout") {
          if (countConnectedComponents(validation.graph) === 2 && canBridgeDisconnectedLayout(candidatePlacements, pieceMap, dockPieceId)) {
            return {
              placements: candidatePlacements,
              layoutValidation: validation
            };
          }
        }
      }
    }
  }

  return null;
}

export function tryExtendAlignedBoardLayout(existingPlacements, nextBoardId, pieceMap) {
  const nextBoard = pieceMap[nextBoardId];
  const anchorIndices = shuffle(existingPlacements.map((_, index) => index));

  for (const anchorIndex of anchorIndices) {
    const anchorPlacement = existingPlacements[anchorIndex];
    const anchorPiece = pieceMap[anchorPlacement.pieceId];

    for (const side of shuffle(DOCK_SIDES)) {
      for (const rotation of shuffle(ROTATIONS)) {
        const candidates = createAlignedAttachedBoardPlacements(anchorPlacement, anchorPiece, nextBoardId, nextBoard, side, rotation);

        for (const nextPlacement of shuffle(candidates)) {
          const candidatePlacements = [...existingPlacements, nextPlacement];
          const validation = validateMainBoardLayout(candidatePlacements, pieceMap, {
            minSharedEdge: MIN_SHARED_EDGE
          });

          if (validation.valid) {
            return {
              placements: candidatePlacements,
              layoutValidation: validation
            };
          }
        }
      }
    }
  }

  return null;
}

export function getBoardPlacementPlanningContext(pieceMap, expansionIds = null, preferences = {}) {
  const allowBlankMiniBoards = preferences.difficulty === "easy" || shouldUseMiniOverlays(preferences);
  const mainBoardIds = getAvailableMainBoardIds(pieceMap, expansionIds).filter((boardId) => (
    allowBlankMiniBoards || !isBlankCustomBoardPiece(pieceMap[boardId])
  ));
  const hasLargeBoards = mainBoardIds.some((boardId) => pieceMap[boardId]?.kind !== "small");
  const explicitEpic = preferences.length === "epic" && !preferences.targetGuidanceOnlyLength;
  const maxBoards = Math.min(
    hasLargeBoards ? (explicitEpic ? 6 : 4) : 6,
    countPhysicalBoards(mainBoardIds, pieceMap)
  );
  return { mainBoardIds, hasLargeBoards, maxBoards };
}

// Board construction stays target-neutral inside the ordinary board-count
// domain. Explicit Epic is the one eligibility exception: it may use up to six
// large boards when the physical inventory supports them. Hidden Any guidance
// never receives that expanded domain; staged calibration still ranks the
// eligible geometry by target fit and predicted work.
export function createBoardPlacements(
  pieceMap,
  preferences,
  expansionIds = null,
  dockPieceId = "docking-bay-a",
  constructionGuidance = null,
  constructionGuidancePlanOverride = null
) {
  const {
    mainBoardIds,
    hasLargeBoards,
    maxBoards
  } = getBoardPlacementPlanningContext(pieceMap, expansionIds, preferences);
  const constructionGuidancePlan = constructionGuidancePlanOverride ?? getCalibratedConstructionPlan(
    maxBoards,
    hasLargeBoards,
    preferences,
    pieceMap,
    constructionGuidance
  );
  const calibrationBoardCount = Number(preferences.calibrationBoardCount);
  let boardCount = Number.isInteger(calibrationBoardCount) && calibrationBoardCount > 0
    ? Math.min(maxBoards, calibrationBoardCount)
    : constructionGuidancePlan?.boardCount ?? neutralBoardCount(maxBoards);
  if (preferences.sandwichedDock && maxBoards >= 2) {
    boardCount = Math.max(2, boardCount);
  }
  const requireDockSupport = !preferences.noDocks && !preferences.virtualBots;
  const hasDockPiece = Boolean(dockPieceId && pieceMap[dockPieceId]);
  const constructionRequirements = preferences.variantConstructionRequirements ?? [];
  const requirementOptions = {
    movingTargets: Boolean(preferences.movingTargets),
    selectionPredicate: (selectedBoardIds) => (
      !requireDockSupport || boardIdsCanSupportDock(selectedBoardIds, pieceMap, dockPieceId)
    )
  };
  const minimumRequirementBoardCount = getMinimumBoardCountForConstructionRequirements(
    mainBoardIds,
    maxBoards,
    pieceMap,
    constructionRequirements,
    requirementOptions
  );
  if (constructionRequirements.length && minimumRequirementBoardCount === null) {
    return null;
  }
  if (minimumRequirementBoardCount !== null) {
    boardCount = Math.max(boardCount, minimumRequirementBoardCount);
  }
  let boardIds = [];

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidateSelection = selectBoardIdsForCourse(
      mainBoardIds,
      boardCount,
      pieceMap,
      { requirements: constructionRequirements, ...requirementOptions }
    );
    const candidateBoardIds = candidateSelection.selectedBoardIds ?? [];
    if (candidateBoardIds.length !== boardCount) {
      continue;
    }
    if (requireDockSupport && !boardIdsCanSupportDock(candidateBoardIds, pieceMap, dockPieceId)) {
      continue;
    }
    boardIds = candidateBoardIds;
    break;
  }

  if (boardIds.length !== boardCount || (preferences.sandwichedDock && boardCount < 2)) {
    return null;
  }
  const firstBoard = pieceMap[boardIds[0]];
  let placements = [{
    pieceId: firstBoard.id,
    x: 24,
    y: 24,
    rotation: sample(ROTATIONS)
  }];

  let layoutValidation = validateMainBoardLayout(placements, pieceMap, {
    minSharedEdge: MIN_SHARED_EDGE
  });

  for (const [index, nextBoardId] of boardIds.slice(1).entries()) {
    const isFinalBoard = index === boardIds.length - 2;
    const forceDockBridge = Boolean(preferences.sandwichedDock && isFinalBoard && hasDockPiece);
    const allowDockBridge = forceDockBridge || (!preferences.alignedLayout && isFinalBoard);
    let extension = null;

    if (forceDockBridge) {
      // A sandwiched dock is deliberately the bridge between two board components.
      // Staggering may offset the opposing long-side frontage; aligned layouts use
      // the same bridge geometry but require the dock frontage alignment below.
      extension = tryExtendBoardLayout(placements, nextBoardId, pieceMap, dockPieceId, true, {
        bridgeOnly: true
      });
    } else {
      extension = preferences.alignedLayout
        ? tryExtendAlignedBoardLayout(placements, nextBoardId, pieceMap)
        : tryExtendBoardLayout(placements, nextBoardId, pieceMap, dockPieceId, allowDockBridge && hasDockPiece);
    }

    if (!extension) {
      return null;
    }

    placements = extension.placements;
    layoutValidation = extension.layoutValidation;
  }

  if (!isSmallBoardLayoutAcceptable(placements, pieceMap, layoutValidation, preferences)) {
    return null;
  }

  return {
    placements,
    boardIds,
    boardCount,
    layoutValidation,
    constructionGuidancePlan
  };
}

export function getDockFrontageTiles(dockPlacement, pieceMap) {
  const dockPiece = pieceMap[dockPlacement.pieceId];
  if (!dockPiece) {
    return [];
  }

  const dims = rotatedDimensions(dockPiece, dockPlacement.rotation ?? 0);
  const frontage = [];

  if (dockPlacement.startFacingOverride === "E") {
    for (let y = dockPlacement.y; y < dockPlacement.y + dims.height; y += 1) {
      frontage.push({ x: dockPlacement.x + dims.width, y });
    }
  } else if (dockPlacement.startFacingOverride === "W") {
    for (let y = dockPlacement.y; y < dockPlacement.y + dims.height; y += 1) {
      frontage.push({ x: dockPlacement.x - 1, y });
    }
  } else if (dockPlacement.startFacingOverride === "S") {
    for (let x = dockPlacement.x; x < dockPlacement.x + dims.width; x += 1) {
      frontage.push({ x, y: dockPlacement.y + dims.height });
    }
  } else if (dockPlacement.startFacingOverride === "N") {
    for (let x = dockPlacement.x; x < dockPlacement.x + dims.width; x += 1) {
      frontage.push({ x, y: dockPlacement.y - 1 });
    }
  }

  return frontage;
}

export function getRectEdgeSpan(rect, facing) {
  if (facing === "E" || facing === "W") {
    return {
      start: rect.y,
      length: rect.height
    };
  }

  if (facing === "N" || facing === "S") {
    return {
      start: rect.x,
      length: rect.width
    };
  }

  return null;
}

export function isAllowedSingleBoardDockAlignment(frontageTiles, rect, facing) {
  const edgeSpan = getRectEdgeSpan(rect, facing);
  if (!edgeSpan || !frontageTiles.length) {
    return false;
  }

  const frontageStart = (facing === "E" || facing === "W")
    ? frontageTiles[0].y
    : frontageTiles[0].x;
  const frontageLength = frontageTiles.length;
  const slack = edgeSpan.length - frontageLength;

  if (slack < 0) {
    return false;
  }

  const allowedStarts = new Set([
    edgeSpan.start,
    edgeSpan.start + slack
  ]);

  if (slack % 2 === 0) {
    allowedStarts.add(edgeSpan.start + slack / 2);
  }

  return allowedStarts.has(frontageStart);
}

export function hasAlignedDockFrontage(structuralPlacements, pieceMap, dockPlacement) {
  const frontageTiles = getDockFrontageTiles(dockPlacement, pieceMap);
  if (!frontageTiles.length) {
    return false;
  }

  const boardRects = structuralPlacements.map((placement, index) => ({
    index,
    ...getPlacedRect(pieceMap[placement.pieceId], placement)
  }));
  const spans = [];

  for (const point of frontageTiles) {
    const rect = boardRects.find((candidate) => pointOnRect(point, candidate));
    if (!rect) {
      return false;
    }

    const previous = spans[spans.length - 1];
    if (previous?.index === rect.index) {
      previous.length += 1;
    } else {
      spans.push({ index: rect.index, length: 1 });
    }
  }

  if (spans.length === 1) {
    return isAllowedSingleBoardDockAlignment(frontageTiles, boardRects[spans[0].index], dockPlacement.startFacingOverride);
  }

  if (spans.length !== 2) {
    return false;
  }

  return spans[0].length === spans[1].length;
}

export function createDockPlacement(structuralPlacements, pieceMap, dockPieceId, dockFlipped, options = {}) {
  const layoutValidation = validateMainBoardLayout(structuralPlacements, pieceMap, {
    minSharedEdge: MIN_SHARED_EDGE
  });
  if (!layoutValidation.valid && layoutValidation.errors.length === 1 && layoutValidation.errors[0] === "disconnected-layout") {
    return findBridgeDockPlacement(structuralPlacements, pieceMap, dockPieceId, dockFlipped);
  }

  const dock = pieceMap[dockPieceId];
  const footprintTiles = buildMainFootprintTiles(structuralPlacements, pieceMap);
  const boundaryRuns = groupBoundaryRuns(getBoundaryEdges(footprintTiles));
  const validRuns = getValidDockRuns(boundaryRuns, dock);
  const dockFrontageLength = getDockFrontageLength(dock);
  const candidates = [];

  for (const run of shuffle(validRuns)) {
    const availableOffsets = run.length - dockFrontageLength;
    const offsets = [];
    for (let offset = 0; offset <= availableOffsets; offset += 1) {
      offsets.push(offset);
    }

    for (const offset of shuffle(offsets)) {
      const dockPlacement = projectDockPlacement(run, offset, dock, dockFlipped);
      const dockValidation = validateDockPlacement(dockPlacement, structuralPlacements, pieceMap, footprintTiles);

      if (dockValidation.valid && (!options.alignedLayout || hasAlignedDockFrontage(structuralPlacements, pieceMap, dockPlacement))) {
        candidates.push({
          dockPlacement,
          dockValidation,
          boundaryRun: run
        });
      }
    }
  }

  if (!options.alignedLayout && options.allowBridgePlacement) {
    const bridgeCandidate = findBridgeDockPlacement(structuralPlacements, pieceMap, dockPieceId, dockFlipped);
    if (bridgeCandidate) {
      candidates.push(bridgeCandidate);
    }
  }

  return candidates.length ? sample(candidates) : null;
}

export function getDockBoundaryRun(structuralPlacements, dockPlacement, pieceMap) {
  const dock = pieceMap[dockPlacement.pieceId];
  const footprintTiles = buildMainFootprintTiles(structuralPlacements, pieceMap);
  const boundaryRuns = groupBoundaryRuns(getBoundaryEdges(footprintTiles));
  const validRuns = getValidDockRuns(boundaryRuns, dock);
  const dockDims = rotatedDimensions(dock, dockPlacement.rotation ?? 0);
  const expectedSide = {
    E: "W",
    S: "N",
    W: "E",
    N: "S"
  }[dockPlacement.startFacingOverride] ?? null;

  return validRuns.find((run) => {
    if (expectedSide && run.side !== expectedSide) {
      return false;
    }

    return [false, true].some((flipped) => {
      const projected = projectDockPlacement(run, 0, dock, flipped);
      if (projected.rotation !== (dockPlacement.rotation ?? 0)) {
        return false;
      }

      if (run.side === "W" || run.side === "E") {
        return projected.x === dockPlacement.x && dockPlacement.y >= projected.y && dockPlacement.y + dockDims.height <= projected.y + run.length;
      }

      return projected.y === dockPlacement.y && dockPlacement.x >= projected.x && dockPlacement.x + dockDims.width <= projected.x + run.length;
    });
  }) ?? null;
}

export function getDockPlacementsFromScenarioPlacements(placements = [], pieceMap = {}) {
  return placements.filter((placement) => pieceMap[placement.pieceId]?.kind === "dock");
}

export function getIntervalCoverageLength(intervals = []) {
  if (!intervals.length) return 0;
  const ordered = intervals
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);

  let total = 0;
  let currentStart = ordered[0]?.[0] ?? 0;
  let currentEnd = ordered[0]?.[1] ?? 0;

  for (const [start, end] of ordered.slice(1)) {
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  }

  return total + Math.max(0, currentEnd - currentStart);
}

export function getSandwichedDockStructure(boardPlacements, dockPlacement, pieceMap) {
  if (!dockPlacement) {
    return { valid: false, boardIndices: [] };
  }

  const dockPiece = pieceMap[dockPlacement.pieceId];
  if (!dockPiece) {
    return { valid: false, boardIndices: [] };
  }

  const dockRect = getPlacedRect(dockPiece, dockPlacement);
  const boardRects = (boardPlacements || []).map((placement, index) => ({
    index,
    ...getPlacedRect(pieceMap[placement.pieceId], placement)
  }));
  const horizontal = dockRect.width >= dockRect.height;
  const sideA = [];
  const sideB = [];
  const sideAIndices = new Set();
  const sideBIndices = new Set();

  for (const rect of boardRects) {
    if (horizontal) {
      const start = Math.max(rect.x, dockRect.x);
      const end = Math.min(rect.x + rect.width, dockRect.x + dockRect.width);
      if (end <= start) continue;

      if (rect.y + rect.height === dockRect.y) {
        sideA.push([start, end]);
        sideAIndices.add(rect.index);
      }
      if (rect.y === dockRect.y + dockRect.height) {
        sideB.push([start, end]);
        sideBIndices.add(rect.index);
      }
    } else {
      const start = Math.max(rect.y, dockRect.y);
      const end = Math.min(rect.y + rect.height, dockRect.y + dockRect.height);
      if (end <= start) continue;

      if (rect.x + rect.width === dockRect.x) {
        sideA.push([start, end]);
        sideAIndices.add(rect.index);
      }
      if (rect.x === dockRect.x + dockRect.width) {
        sideB.push([start, end]);
        sideBIndices.add(rect.index);
      }
    }
  }

  const requiredCoverage = horizontal ? dockRect.width : dockRect.height;
  const sideACoverage = getIntervalCoverageLength(sideA);
  const sideBCoverage = getIntervalCoverageLength(sideB);
  const valid = (
    sideACoverage >= requiredCoverage &&
    sideBCoverage >= requiredCoverage &&
    sideAIndices.size > 0 &&
    sideBIndices.size > 0
  );

  return {
    valid,
    boardIndices: valid
      ? [...new Set([...sideAIndices, ...sideBIndices])]
      : [],
    sideAIndices: valid ? [...sideAIndices] : [],
    sideBIndices: valid ? [...sideBIndices] : [],
    sideACoverage,
    sideBCoverage,
    requiredCoverage
  };
}

export function getBoardAdjacencyForSandwichSides(boardPlacements, pieceMap) {
  const rects = (boardPlacements || []).map((placement, index) => ({
    index,
    ...getPlacedRect(pieceMap[placement.pieceId], placement)
  }));
  const adjacency = new Map(rects.map((rect) => [rect.index, new Set()]));
  const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

  for (let left = 0; left < rects.length; left += 1) {
    for (let right = left + 1; right < rects.length; right += 1) {
      const a = rects[left];
      const b = rects[right];
      let sharedEdge = 0;
      if (a.x + a.width === b.x || b.x + b.width === a.x) {
        sharedEdge = overlap(a.y, a.y + a.height, b.y, b.y + b.height);
      } else if (a.y + a.height === b.y || b.y + b.height === a.y) {
        sharedEdge = overlap(a.x, a.x + a.width, b.x, b.x + b.width);
      }
      if (sharedEdge <= 0) continue;
      adjacency.get(a.index).add(b.index);
      adjacency.get(b.index).add(a.index);
    }
  }

  return adjacency;
}

export function expandSandwichSideBoardIndices(seedIndices, adjacency) {
  const expanded = new Set(seedIndices || []);
  const queue = [...expanded];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const next of adjacency.get(current) || []) {
      if (expanded.has(next)) continue;
      expanded.add(next);
      queue.push(next);
    }
  }
  return expanded;
}

export function getSandwichedDockSideBoardGroups(boardPlacements, dockPlacements, pieceMap) {
  const adjacency = getBoardAdjacencyForSandwichSides(boardPlacements, pieceMap);

  for (const dockPlacement of dockPlacements || []) {
    const structure = getSandwichedDockStructure(boardPlacements, dockPlacement, pieceMap);
    if (!structure.valid) continue;

    const sideA = expandSandwichSideBoardIndices(structure.sideAIndices, adjacency);
    const sideB = expandSandwichSideBoardIndices(structure.sideBIndices, adjacency);
    const overlap = [...sideA].some((index) => sideB.has(index));
    if (overlap) continue;

    return { sideA, sideB };
  }

  return null;
}

export function getSandwichedDockUseProfile(
  boardPlacements,
  dockPlacements,
  pieceMap,
  checkpoints
) {
  const sides = getSandwichedDockSideBoardGroups(boardPlacements, dockPlacements, pieceMap);
  if (!sides) {
    return {
      active: false,
      sideACheckpoints: 0,
      sideBCheckpoints: 0,
      missingSideCount: 0,
      missingSideBoardIndices: [],
      penalty: 0
    };
  }

  let sideACheckpoints = 0;
  let sideBCheckpoints = 0;
  (checkpoints || []).forEach((checkpoint) => {
    boardPlacements.forEach((placement, index) => {
      if (!pointOnPlacement(checkpoint, placement, pieceMap)) return;
      if (sides.sideA.has(index)) sideACheckpoints += 1;
      if (sides.sideB.has(index)) sideBCheckpoints += 1;
    });
  });

  const missingSideBoardIndices = [];
  let missingSideCount = 0;
  if (sideACheckpoints === 0) {
    missingSideCount += 1;
    missingSideBoardIndices.push(...sides.sideA);
  }
  if (sideBCheckpoints === 0) {
    missingSideCount += 1;
    missingSideBoardIndices.push(...sides.sideB);
  }

  return {
    active: true,
    sideACheckpoints,
    sideBCheckpoints,
    missingSideCount,
    missingSideBoardIndices: [...new Set(missingSideBoardIndices)].sort((a, b) => a - b),
    // A physically valid sandwich with a flagless side is playable, but it
    // misses the setup's intended two-sided race use. Keep this as a large soft
    // mismatch so it can survive only when the search cannot find a better one.
    penalty: missingSideCount * 20
  };
}

export function getProtectedSandwichBoardIndices(boardPlacements, dockPlacements, pieceMap) {
  const protectedIndices = new Set();

  for (const dockPlacement of dockPlacements || []) {
    const structure = getSandwichedDockStructure(boardPlacements, dockPlacement, pieceMap);
    if (!structure.valid) continue;
    structure.boardIndices.forEach((index) => protectedIndices.add(index));
  }

  return protectedIndices;
}

export function hasPhysicalSandwichedDock(boardPlacements, dockPlacements, pieceMap) {
  return (dockPlacements || []).some((dockPlacement) => (
    getSandwichedDockStructure(boardPlacements, dockPlacement, pieceMap).valid
  ));
}

export function getSandwichedDockFacingTowardCheckpoint(dockPlacement, pieceMap, checkpoint) {
  if (!dockPlacement || !checkpoint) return null;
  const dockPiece = pieceMap[dockPlacement.pieceId];
  if (!dockPiece) return null;

  const dims = rotatedDimensions(dockPiece, dockPlacement.rotation ?? 0);
  const centerX = dockPlacement.x + (dims.width - 1) / 2;
  const centerY = dockPlacement.y + (dims.height - 1) / 2;

  if (dims.width >= dims.height) {
    if (checkpoint.y < centerY) return "N";
    if (checkpoint.y > centerY) return "S";
  } else {
    if (checkpoint.x < centerX) return "W";
    if (checkpoint.x > centerX) return "E";
  }

  return dockPlacement.startFacingOverride ?? null;
}

export function orientSandwichedDockStartsTowardCheckpoint(starts, dockPlacements, pieceMap, checkpoint) {
  if (!checkpoint || !starts?.length || !dockPlacements?.length) return starts;

  return starts.map((start) => {
    const dockPlacement = dockPlacements.find((placement) => (
      pointOnPlacement(start, placement, pieceMap)
    ));
    if (!dockPlacement) return start;
    const facing = getSandwichedDockFacingTowardCheckpoint(dockPlacement, pieceMap, checkpoint);
    return facing ? { ...start, facing } : start;
  });
}

export function buildDockSummaries(boardPlacements, dockPlacements, pieceMap) {
  return dockPlacements.map((dockPlacement) => ({
    pieceId: dockPlacement.pieceId,
    flipped: Boolean((dockPlacement.rotation ?? 0) % 180),
    boundaryRun: getDockBoundaryRun(boardPlacements, dockPlacement, pieceMap)
  }));
}
