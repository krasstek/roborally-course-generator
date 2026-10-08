// Robo Rally Course Randomizer - construction clean-up: pruning unused docks, boards and irrelevant overlays after routing
import { summarizeFixedRouteBoardAblation } from "../../analyze.js";
import { buildResolvedMap, placePiece } from "../../board.js";
import {
  getPlacementOccupiedOffsets,
  manhattanDistance,
  pointOnPlacement
} from "./layout-geometry.js";
import { isCheckpointActiveFeature } from "./variant-availability.js";

export function getSelectedFullCourseRoutes(usableStarts = []) {
  const seen = new Set();
  const routes = [];
  (usableStarts || []).forEach((startAnalysis) => {
    const route = startAnalysis?.fullCourseRoute ?? null;
    if (!route || seen.has(route)) return;
    seen.add(route);
    routes.push(route);
  });
  return routes;
}

export function collectUsedBoardIndices(sequence, boardPlacements, pieceMap, usableStarts, checkpoints) {
  const used = new Set();

  checkpoints.forEach((checkpoint) => {
    boardPlacements.forEach((placement, index) => {
      if (pointOnPlacement(checkpoint, placement, pieceMap)) {
        used.add(index);
      }
    });
  });

  // v49eg: physical board cleanup is about the course the player is actually
  // being offered, not every alternate leg witness retained internally by route
  // search. A board touched only by an unselected distinctRoute is still an
  // orphan candidate. The whole-course A/B reanalysis below decides whether
  // removing it materially changes the generated course.
  getSelectedFullCourseRoutes(usableStarts).forEach((route) => {
    (route.path || []).forEach((point) => {
      boardPlacements.forEach((placement, index) => {
        if (pointOnPlacement(point, placement, pieceMap)) {
          used.add(index);
        }
      });
    });
  });

  return used;
}

export function overlayFitsWithinBoards(overlayPlacement, boardPlacements, pieceMap) {
  const piece = pieceMap[overlayPlacement.pieceId];
  if (!piece) {
    return false;
  }

  return getPlacementOccupiedOffsets(piece, overlayPlacement.rotation ?? 0).every(({ x, y }) => (
    boardPlacements.some((placement) => (
      pointOnPlacement({ x: overlayPlacement.x + x, y: overlayPlacement.y + y }, placement, pieceMap)
    ))
  ));
}


export function collectTrackedRouteObjects(sequence, usableStarts = []) {
  const routes = [];
  const seen = new Set();
  const add = (route) => {
    if (!route?.transitions?.length || seen.has(route)) return;
    seen.add(route);
    routes.push(route);
  };

  usableStarts.forEach((startAnalysis) => {
    add(startAnalysis.selectedRoute);
  });

  sequence?.legs?.forEach((leg) => {
    (leg.analysis?.distinctRoutes || []).forEach(add);
  });

  return routes;
}

export function collectTrackedRouteTileKeys(sequence, usableStarts = []) {
  const keys = new Set();

  usableStarts.forEach((startAnalysis) => {
    (startAnalysis.selectedRoute?.path || []).forEach((point) => {
      keys.add(`${point.x},${point.y}`);
    });
  });

  sequence?.legs?.forEach((leg) => {
    (leg.analysis?.distinctRoutes || []).forEach((route) => {
      (route.path || []).forEach((point) => {
        keys.add(`${point.x},${point.y}`);
      });
    });
  });

  return keys;
}

export function placementTouchesTrackedRoute(placement, pieceMap, routeTileKeys) {
  const piece = pieceMap[placement.pieceId];
  if (!piece || !routeTileKeys?.size) {
    return false;
  }

  return getPlacementOccupiedOffsets(piece, placement.rotation ?? 0).some(({ x, y }) => (
    routeTileKeys.has(`${placement.x + x},${placement.y + y}`)
  ));
}

export function pruneUnusedDockPlacements(dockPlacements, pieceMap, sequence, usableStarts, checkpoints) {
  if ((dockPlacements?.length ?? 0) <= 1) {
    return {
      dockPlacements,
      pruned: false
    };
  }

  const routeTileKeys = collectTrackedRouteTileKeys(sequence, usableStarts);
  const keptDockPlacements = dockPlacements.filter((dockPlacement) => (
    usableStarts.some((startAnalysis) => pointOnPlacement(startAnalysis.start, dockPlacement, pieceMap)) ||
    checkpoints.some((checkpoint) => pointOnPlacement(checkpoint, dockPlacement, pieceMap)) ||
    placementTouchesTrackedRoute(dockPlacement, pieceMap, routeTileKeys)
  ));

  if (!keptDockPlacements.length) {
    return {
      dockPlacements,
      pruned: false
    };
  }

  return {
    dockPlacements: keptDockPlacements,
    pruned: keptDockPlacements.length !== dockPlacements.length
  };
}

export function overlayTouchesTrackedPlay(overlayPlacement, pieceMap, routeTileKeys, checkpoints = [], radius = 2) {
  const piece = pieceMap[overlayPlacement.pieceId];
  if (!piece) {
    return false;
  }

  return getPlacementOccupiedOffsets(piece, overlayPlacement.rotation ?? 0).some(({ x, y }) => {
    const absolute = {
      x: overlayPlacement.x + x,
      y: overlayPlacement.y + y
    };

    if (checkpoints.some((checkpoint) => manhattanDistance(absolute, checkpoint) <= radius)) {
      return true;
    }

    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > radius) {
          continue;
        }
        if (routeTileKeys.has(`${absolute.x + dx},${absolute.y + dy}`)) {
          return true;
        }
      }
    }

    return false;
  });
}

export function overlaySitsUnderCheckpoint(overlayPlacement, pieceMap, checkpoints = []) {
  const piece = pieceMap[overlayPlacement.pieceId];
  if (!piece || !checkpoints.length) {
    return false;
  }

  return getPlacementOccupiedOffsets(piece, overlayPlacement.rotation ?? 0).some(({ x, y }) => (
    checkpoints.some((checkpoint) => (
      checkpoint.x === overlayPlacement.x + x &&
      checkpoint.y === overlayPlacement.y + y
    ))
  ));
}

export function overlayHasCheckpointActiveFeatures(overlayPlacement, pieceMap, checkpoints = [], options = {}) {
  const piece = pieceMap[overlayPlacement.pieceId];
  if (!piece || !checkpoints.length) {
    return false;
  }

  const placed = placePiece(piece, overlayPlacement);
  return placed.tiles.some((tile) => (
    checkpoints.some((checkpoint) => checkpoint.x === tile.x && checkpoint.y === tile.y) &&
    (tile.features || []).some((feature) => isCheckpointActiveFeature(feature, options))
  ));
}

export function pruneIrrelevantOverlayPlacements(overlayPlacements, pieceMap, sequence, usableStarts, checkpoints, options = {}) {
  if (!overlayPlacements?.length) {
    return {
      overlayPlacements,
      pruned: false
    };
  }

  const routeTileKeys = collectTrackedRouteTileKeys(sequence, usableStarts);
  const hazardousFlags = Boolean(options.hazardousFlags);
  const initiallyKept = overlayPlacements.filter((placement) => (
    (
      hazardousFlags ||
      !overlaySitsUnderCheckpoint(placement, pieceMap, checkpoints) ||
      overlayHasCheckpointActiveFeatures(placement, pieceMap, checkpoints, options)
    ) &&
    overlayTouchesTrackedPlay(placement, pieceMap, routeTileKeys, checkpoints, 2)
  ));
  return {
    overlayPlacements: initiallyKept,
    pruned: initiallyKept.length !== overlayPlacements.length
  };
}

export function pruneUnusedBoardPlacements(
  boardPlacements,
  overlayPlacements,
  pieceMap,
  sequence,
  usableStarts,
  checkpoints,
  options = {}
) {
  if ((boardPlacements?.length ?? 0) <= 1) {
    return {
      boardPlacements,
      overlayPlacements,
      pruned: false,
      ablationDecisions: []
    };
  }

  const usedBoardIndices = collectUsedBoardIndices(
    sequence,
    boardPlacements,
    pieceMap,
    usableStarts,
    checkpoints
  );
  const usedPlacements = new Set(
    [...usedBoardIndices]
      .map((index) => boardPlacements[index])
      .filter(Boolean)
  );
  const protectedPlacements = new Set(
    [...(options.protectedBoardIndices || [])]
      .filter((index) => (
        Number.isInteger(index) &&
        index >= 0 &&
        index < boardPlacements.length
      ))
      .map((index) => boardPlacements[index])
  );
  for (const placement of options.protectedBoardPlacements || []) {
    if (placement) protectedPlacements.add(placement);
  }
  const fixedRouteField = getSelectedFullCourseRoutes(usableStarts);
  const dockPlacements = options.dockPlacements || [];
  const decisions = [];

  // v49eg:
  // An orphan candidate has no checkpoint and no SELECTED full-course route on
  // it. Internal alternate leg witnesses no longer count as visible board use.
  // The existing fixed-route ablation is still the cheap first gate: if removing
  // the board changes current-route displacement/control or robot-laser LOS, keep
  // it immediately. If that gate is clear, the caller removes ONE board
  // tentatively and runs the complete course pipeline again. Only a reduced
  // course with no material selected-route/start/difficulty/length/fairness/
  // traffic/economy change confirms the silent removal. Any material change or
  // failed reduced analysis restores and protects the board.
  for (let boardIndex = 0; boardIndex < boardPlacements.length; boardIndex += 1) {
    const candidate = boardPlacements[boardIndex];
    if (
      usedPlacements.has(candidate) ||
      protectedPlacements.has(candidate)
    ) {
      continue;
    }

    const nextBoardPlacements = boardPlacements.filter(
      (placement) => placement !== candidate
    );
    if (!nextBoardPlacements.length) {
      continue;
    }
    const nextOverlayPlacements = (overlayPlacements || []).filter(
      (placement) => (
        overlayFitsWithinBoards(
          placement,
          nextBoardPlacements,
          pieceMap
        )
      )
    );

    const currentResolved = buildResolvedMap(
      [
        ...boardPlacements,
        ...dockPlacements,
        ...(overlayPlacements || [])
      ],
      pieceMap
    );
    const ablatedResolved = buildResolvedMap(
      [
        ...nextBoardPlacements,
        ...dockPlacements,
        ...nextOverlayPlacements
      ],
      pieceMap
    );
    const ablation = summarizeFixedRouteBoardAblation(
      currentResolved.tileMap,
      ablatedResolved.tileMap,
      fixedRouteField,
      options
    );
    const safeToRemove = Boolean(
      fixedRouteField.length &&
      ablation.routePositionMissingCount === 0 &&
      !ablation.modeledEffectDetected
    );

    const decision = {
      boardIndex,
      pieceId: candidate.pieceId,
      action: safeToRemove ? "test-remove" : "retain",
      reason: safeToRemove
        ? "fixed-route-ablation-clear-pending-whole-course"
        : "modeled-current-route-effect",
      candidateType: "orphan-no-selected-route-no-checkpoint",
      ablation
    };
    decisions.push(decision);

    if (safeToRemove) {
      // Intentionally test at most one board per cleanup pass. The caller runs a
      // complete reduced-course analysis and then either confirms this removal or
      // restores/protects the board before another orphan candidate is tested.
      return {
        boardPlacements: nextBoardPlacements,
        overlayPlacements: nextOverlayPlacements,
        pruned: true,
        removedBoard: decision,
        removedBoardPlacement: candidate,
        ablationDecisions: decisions
      };
    }
  }

  return {
    boardPlacements,
    overlayPlacements,
    pruned: false,
    removedBoard: null,
    ablationDecisions: decisions
  };
}
