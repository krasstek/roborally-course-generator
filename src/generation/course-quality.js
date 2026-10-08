// Robo Rally Course Randomizer - course quality: target acceptance gate, checkpoint pacing and anticlimax, route drama, board footprint and gameplay relevance
import { summarizeFixedRouteBoardAblation } from "../../analyze.js";
import { buildResolvedMap, rotatedDimensions } from "../../board.js";
import { getProtectedSandwichBoardIndices } from "./board-layout.js";
import {
  TARGET_STRONG_DIFFICULTY_FIT,
  TARGET_STRONG_EASY_DIFFICULTY_FIT,
  TARGET_STRONG_LENGTH_FIT
} from "./config.js";
import {
  collectTrackedRouteTileKeys,
  getSelectedFullCourseRoutes,
  overlayFitsWithinBoards,
  overlayTouchesTrackedPlay
} from "./construction-cleanup.js";
import { getPlacementOccupiedOffsets, pointOnPlacement } from "./layout-geometry.js";
import { getTuningDifficulty } from "./preferences.js";
import { getDifficultyThresholds } from "./targets.js";

export function nonOverlappingDifficultyBandDistance(value, band, thresholds) {
  if (band === "any") return 0;
  const [low, high] = thresholds[band];
  if (value < low) return low - value;
  if (value >= high) {
    // Production difficulty bands are genuinely non-overlapping. At the exact
    // upper cut, preserve a positive (but negligible) mismatch so the candidate
    // is not mislabeled as an exact match to both adjacent semantic bands.
    return Math.max(value - high, 1e-9);
  }
  return 0;
}

export function getTargetAxisAcceptanceGate({
  difficultyValue,
  difficultyFit,
  difficultyDirection,
  lengthFit,
  lengthDirection,
  preferences = {},
  difficultyThresholds = getDifficultyThresholds()
} = {}) {
  const requestedDifficulty = preferences.difficulty ?? "any";
  const requestedLength = preferences.length ?? "any";
  const difficultyGuidanceOnly = Boolean(preferences.targetGuidanceOnlyDifficulty);
  const lengthGuidanceOnly = Boolean(preferences.targetGuidanceOnlyLength);
  const strongDifficultyThreshold = requestedDifficulty === "easy"
    ? TARGET_STRONG_EASY_DIFFICULTY_FIT
    : TARGET_STRONG_DIFFICULTY_FIT;

  // Intermediate -> Robots. Must. Die. crosses a player-visible category cliff.
  // The RE-turn band gap is converted back through the 60 fit-point/RE bridge,
  // but category membership itself remains a strong/non-compensatory mismatch.
  const intermediateToBrutal = Boolean(
    !difficultyGuidanceOnly &&
    requestedDifficulty === "moderate" &&
    difficultyDirection === "high" &&
    Number.isFinite(Number(difficultyValue)) &&
    Number(difficultyValue) >= Number(difficultyThresholds?.brutal?.[0] ?? Infinity)
  );
  const grossDifficultyMismatch = Boolean(
    !difficultyGuidanceOnly &&
    requestedDifficulty !== "any" &&
    difficultyDirection !== "matched" &&
    (Number(difficultyFit) >= strongDifficultyThreshold || intermediateToBrutal)
  );
  const grossLengthMismatch = Boolean(
    !lengthGuidanceOnly &&
    requestedLength !== "any" &&
    lengthDirection !== "matched" &&
    Number(lengthFit) >= TARGET_STRONG_LENGTH_FIT
  );

  return {
    ordinaryAcceptable: !(grossDifficultyMismatch || grossLengthMismatch),
    grossDifficultyMismatch,
    grossLengthMismatch,
    intermediateToBrutal,
    strongDifficultyThreshold,
    strongLengthThreshold: TARGET_STRONG_LENGTH_FIT
  };
}

export function shouldUseCompactLengthFit(preferences = {}) {
  return preferences.length === "short" && getTuningDifficulty(preferences.difficulty) === "hard";
}

export function getMovingTargetVolatilityPenalty(stats = {}, fairnessStdDev = 0, preferences = {}) {
  if (!stats?.activeCount) {
    return 0;
  }

  const playerScale = Math.max(1, (preferences.playerCount ?? 4) / 4);
  const raw = (
    stats.activeCount * 2 +
    Math.max(0, stats.totalPathLength - stats.activeCount) * 0.35 +
    stats.totalTurns * 0.3 +
    stats.fastSegments * 0.28 +
    stats.wrapCount * 0.5 +
    Math.max(0, fairnessStdDev - 6) * 0.16
  ) * playerScale;

  return Number(raw.toFixed(2));
}

export function getFullCourseExpectedRoutes(sequence) {
  return (sequence?.firstLeg?.starts || [])
    .filter((startAnalysis) => startAnalysis.reachable && startAnalysis.fullCourseRoute)
    .map((startAnalysis) => ({
      startIndex: startAnalysis.index,
      route: startAnalysis.fullCourseRoute
    }));
}

export function getRouteDramaProfile(sequence, preferences = {}) {
  const entries = getFullCourseExpectedRoutes(sequence);
  if (entries.length <= 1) {
    return {
      level: "none",
      score: 0,
      penalty: 0,
      crossings: 0,
      sharedTiles: 0,
      sharedTilePairs: 0,
      reverseEdges: 0,
      pairCount: 0
    };
  }

  let sharedTilePairs = 0;
  let reverseEdges = 0;
  const sharedTiles = new Set();

  function routeTileIndex(route) {
    const map = new Map();
    (route.path || []).forEach((point, index) => {
      const key = `${point.x},${point.y}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(index);
    });
    return map;
  }

  function routeEdges(route) {
    const edges = new Set();
    const path = route.path || [];
    for (let index = 1; index < path.length; index += 1) {
      const from = path[index - 1];
      const to = path[index];
      if (to.jump) {
        continue;
      }
      edges.add(`${from.x},${from.y}>${to.x},${to.y}`);
    }
    return edges;
  }

  const indexed = entries.map((entry) => ({
    ...entry,
    tiles: routeTileIndex(entry.route),
    edges: routeEdges(entry.route)
  }));

  for (let left = 0; left < indexed.length; left += 1) {
    for (let right = left + 1; right < indexed.length; right += 1) {
      for (const key of indexed[left].tiles.keys()) {
        const rightIndices = indexed[right].tiles.get(key);
        if (!rightIndices) {
          continue;
        }
        sharedTiles.add(key);
        sharedTilePairs += 1;
      }

      for (const edge of indexed[left].edges) {
        const [from, to] = edge.split(">");
        if (indexed[right].edges.has(`${to}>${from}`)) {
          reverseEdges += 1;
        }
      }
    }
  }

  const pairCount = (entries.length * (entries.length - 1)) / 2;
  const normalizedShared = pairCount ? sharedTilePairs / pairCount : 0;
  const normalizedReverse = pairCount ? reverseEdges / pairCount : 0;
  const score = Number(Math.min(40, normalizedShared * 2.2 + normalizedReverse * 1.6).toFixed(2));
  const target = preferences.length === "short" || preferences.difficulty === "easy"
    ? 2.5
    : preferences.length === "long" || preferences.length === "epic" || preferences.difficulty === "hard" || preferences.difficulty === "brutal"
      ? 7
      : 5;
  const weakPenaltyScale = preferences.length === "short" || preferences.difficulty === "easy" ? 0.35 : 1;
  const weakPenalty = Math.max(0, target - score) * weakPenaltyScale;
  const excessivePenalty = Math.max(0, score - 20) * 0.45;
  const penalty = Number((weakPenalty + excessivePenalty).toFixed(2));
  const level = score >= 14 ? "high" : score >= 7 ? "moderate" : score >= 3 ? "low" : "none";

  return {
    level,
    score,
    penalty,
    crossings: sharedTilePairs,
    sharedTiles: sharedTiles.size,
    sharedTilePairs,
    reverseEdges,
    pairCount
  };
}

export function getOpeningLegAnticlimax(sequence, preferences = {}, usableStarts = null) {
  const sourceStarts = Array.isArray(usableStarts)
    ? usableStarts
    : (sequence?.firstLeg?.starts || []).filter((entry) => entry.reachable);
  const actions = sourceStarts
    .map((entry) => entry.selectedRoute?.actions ?? entry.bestActions)
    .filter(Number.isFinite);
  if (!actions.length) {
    return {
      active: false,
      fastestActions: null,
      averageActions: null,
      expectedFastest: 4,
      expectedAverage: 6,
      penalty: 0,
      routeCount: 0
    };
  }
  const fastestActions = Math.min(...actions);
  const averageActions = actions.reduce((sum, value) => sum + value, 0) / actions.length;
  const fastestShortfall = Math.max(0, 4 - fastestActions);
  const averageShortfall = Math.max(0, 6 - averageActions);
  const lengthScale = preferences.targetGuidanceOnlyLength
    ? 0.5
    : preferences.length === "short"
      ? 0.2
      : preferences.length === "epic"
        ? 1.0
        : preferences.length === "long"
          ? 0.8
          : 0.5;
  const penalty = (
    fastestShortfall * fastestShortfall * 2.2 +
    averageShortfall * averageShortfall * 1.2
  ) * lengthScale;
  return {
    active: fastestShortfall > 0 || averageShortfall > 0,
    fastestActions,
    averageActions: Number(averageActions.toFixed(2)),
    expectedFastest: 4,
    expectedAverage: 6,
    penalty: Number(penalty.toFixed(2)),
    routeCount: actions.length
  };
}

export function getIntermediateCheckpointPacing(sequence) {
  const intermediateLegs = (sequence?.legs || []).slice(1, -1);
  const legAverages = intermediateLegs
    .map((leg, index) => ({
      from: leg?.from ?? index + 1,
      to: leg?.to ?? index + 2,
      actions: leg?.analysis?.summary?.averageRouteActions
    }))
    .filter((entry) => Number.isFinite(entry.actions));
  if (!legAverages.length) {
    return {
      active: false,
      shortestAverageActions: null,
      averageActions: null,
      expectedShortestAverage: 4,
      expectedAverage: 6,
      penalty: 0,
      legs: []
    };
  }

  const shortestAverageActions = Math.min(...legAverages.map((entry) => entry.actions));
  const averageActions = legAverages.reduce((sum, entry) => sum + entry.actions, 0) / legAverages.length;
  const shortestShortfall = Math.max(0, 4 - shortestAverageActions);
  const averageShortfall = Math.max(0, 6 - averageActions);
  const penalty = (
    shortestShortfall * shortestShortfall * 1.4 +
    averageShortfall * averageShortfall * 0.8
  );
  return {
    active: shortestShortfall > 0 || averageShortfall > 0,
    shortestAverageActions: Number(shortestAverageActions.toFixed(2)),
    averageActions: Number(averageActions.toFixed(2)),
    expectedShortestAverage: 4,
    expectedAverage: 6,
    penalty: Number(penalty.toFixed(2)),
    legs: legAverages.map((entry) => ({ ...entry, actions: Number(entry.actions.toFixed(2)) }))
  };
}

export function getBoardFootprintUseProfile(
  sequence,
  boardPlacements = [],
  pieceMap = {},
  usableStarts = [],
  checkpoints = []
) {
  if (boardPlacements.length <= 1) return { penalty: 0, weakBoardCount: 0, boards: [] };

  // v49eg: footprint describes the selected full-course route field the player
  // can inspect. Internal alternate leg witnesses do not make an otherwise
  // orphan board count as visibly used table space. Preserve the older per-leg
  // averaging shape by expanding each selected full-course route back into its
  // selected leg routes when those are available.
  const selectedFullCourseRoutes = getSelectedFullCourseRoutes(usableStarts);
  const selectedLegCount = selectedFullCourseRoutes.reduce(
    (maximum, route) => Math.max(maximum, route?.legRoutes?.length ?? 0),
    0
  );
  const routeGroups = selectedLegCount > 0
    ? Array.from({ length: selectedLegCount }, (_, legIndex) => (
      selectedFullCourseRoutes
        .map((route) => route?.legRoutes?.[legIndex])
        .filter(Boolean)
    )).filter((group) => group.length)
    : selectedFullCourseRoutes.length
      ? [selectedFullCourseRoutes]
      : [];
  const routes = routeGroups.flat();

  function routeRegisterCountOnBoard(route, placement) {
    return (route.transitions || []).reduce((count, transition) => {
      const points = [
        transition?.from,
        ...(transition?.traversed || []),
        transition?.to
      ].filter(Boolean);
      return count + (points.some((point) => pointOnPlacement(point, placement, pieceMap)) ? 1 : 0);
    }, 0);
  }

  function routeMaxBoardDepth(route, placement) {
    const piece = pieceMap[placement.pieceId];
    if (!piece) return 0;
    const dims = rotatedDimensions(piece, placement.rotation ?? 0);
    let maxDepth = 0;
    (route.path || []).forEach((point) => {
      if (!pointOnPlacement(point, placement, pieceMap)) return;
      const localX = point.x - placement.x;
      const localY = point.y - placement.y;
      const depth = 1 + Math.min(
        localX,
        dims.width - 1 - localX,
        localY,
        dims.height - 1 - localY
      );
      maxDepth = Math.max(maxDepth, depth);
    });
    return maxDepth;
  }

  const targetRegisters = 5;
  const largeBoardTargetDepth = 4;
  const smallBoardTargetDepth = largeBoardTargetDepth / 2;
  const weakUseThreshold = 0.8;
  const efficientTransitRegisters = 3;

  const boards = boardPlacements.map((placement, boardIndex) => {
    const piece = pieceMap[placement.pieceId];
    const routeTiles = new Set();
    let routeVisits = 0;
    let maxDepth = 0;
    let bestTransitRegisters = 0;
    let bestTransitDepth = 0;

    routes.forEach((route) => {
      let touched = false;
      (route.path || []).forEach((point) => {
        if (!pointOnPlacement(point, placement, pieceMap)) return;
        routeTiles.add(`${point.x},${point.y}`);
        touched = true;
      });
      if (!touched) return;
      routeVisits += 1;
      const routeDepth = routeMaxBoardDepth(route, placement);
      maxDepth = Math.max(maxDepth, routeDepth);
      const path = route.path || [];
      const startsOutside = path.length > 0 && !pointOnPlacement(path[0], placement, pieceMap);
      const endsOutside = path.length > 0 && !pointOnPlacement(path.at(-1), placement, pieceMap);
      if (startsOutside && endsOutside) {
        const transitRegisters = routeRegisterCountOnBoard(route, placement);
        if (
          transitRegisters > bestTransitRegisters ||
          (transitRegisters === bestTransitRegisters && routeDepth > bestTransitDepth)
        ) {
          bestTransitRegisters = transitRegisters;
          bestTransitDepth = routeDepth;
        }
      }
    });

    const representativeRegisters = routeGroups.reduce((sum, group) => {
      if (!group.length) return sum;
      const groupRegisters = group.reduce(
        (groupSum, route) => groupSum + routeRegisterCountOnBoard(route, placement),
        0
      ) / group.length;
      return sum + groupRegisters;
    }, 0);
    const targetDepth = piece?.kind === "small"
      ? smallBoardTargetDepth
      : largeBoardTargetDepth;
    const registerCoverage = Math.min(1, representativeRegisters / targetRegisters);
    const depthCoverage = Math.min(1, maxDepth / targetDepth);
    let contributionScore = registerCoverage * 0.6 + depthCoverage * 0.4;
    const hasEfficientTransit = (
      bestTransitRegisters >= efficientTransitRegisters &&
      bestTransitDepth >= targetDepth
    );
    if (hasEfficientTransit) {
      contributionScore = Math.max(contributionScore, 0.9);
    }

    const finalCheckpoint = checkpoints.at(-1);
    const finalCheckpointOnBoard = Boolean(
      finalCheckpoint && pointOnPlacement(finalCheckpoint, placement, pieceMap)
    );
    if (finalCheckpointOnBoard && !hasEfficientTransit && representativeRegisters < targetRegisters) {
      contributionScore = Math.max(0, contributionScore - 0.15);
    }
    contributionScore = Math.min(1, contributionScore);

    const used = routeTiles.size > 0;
    // Truly irrelevant boards are removed during route cleanup. A board that
    // survives with zero routed use is therefore structurally protected or close
    // enough to tracked play to provide pressure/options; keep it, but score that
    // weak use continuously instead of turning it into a hard failure.
    const weakUse = !used || contributionScore < weakUseThreshold;
    const penalty = !used
      ? 8
      : contributionScore < 0.5
        ? 8
        : contributionScore < 0.65
          ? 7
          : contributionScore < 0.8
            ? 3
            : contributionScore < 0.9
              ? 1
              : 0;

    return {
      boardIndex,
      uniqueRouteTiles: routeTiles.size,
      routeVisits,
      representativeRegisters: Number(representativeRegisters.toFixed(2)),
      maxDepth,
      targetDepth,
      bestTransitRegisters,
      bestTransitDepth,
      hasEfficientTransit,
      finalCheckpointOnBoard,
      contributionScore: Number(contributionScore.toFixed(3)),
      weakUse,
      penalty
    };
  });
  const penalty = boards.reduce((sum, board) => sum + board.penalty, 0);
  return {
    model: "board-footprint-selected-full-course-v49eg",
    semanticRole: "table-space-and-layout-footprint",
    penalty: Number(penalty.toFixed(2)),
    weakBoardCount: boards.filter((board) => board.weakUse).length,
    boards
  };
}

export function getBoardGameplayRelevanceProfile(
  sequence,
  boardPlacements = [],
  overlayPlacements = [],
  dockPlacements = [],
  pieceMap = {},
  usableStarts = [],
  checkpoints = [],
  tileMap = null,
  footprintProfile = null,
  options = {}
) {
  if (!boardPlacements.length) {
    return {
      model: "board-gameplay-relevance-v49eg",
      observationalOnly: true,
      demonstratedCount: 0,
      pendingAblationCount: 0,
      removalCandidateCount: 0,
      boards: []
    };
  }

  const routeTileKeys = collectTrackedRouteTileKeys(sequence, usableStarts);
  const routeTiles = [...routeTileKeys].map((key) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y };
  });
  const footprintByIndex = new Map(
    (footprintProfile?.boards ?? []).map((board) => [board.boardIndex, board])
  );
  const fixedRouteField = getSelectedFullCourseRoutes(usableStarts);
  const protectedSandwichBoards = options.sandwichedDock
    ? getProtectedSandwichBoardIndices(
      boardPlacements,
      dockPlacements,
      pieceMap
    )
    : new Set();
  const wholeCourseMaterialRetainedPieceIds = new Set(
    (options.boardCleanupAuditTrail || [])
      .flatMap((entry) => entry?.decisions || [])
      .filter((decision) => (
        decision?.action === "restore" &&
        (decision?.reason === "whole-course-material-difference" ||
          decision?.reason === "whole-course-reanalysis-failed")
      ))
      .map((decision) => decision.pieceId)
      .filter(Boolean)
  );

  const boards = boardPlacements.map((placement, boardIndex) => {
    const piece = pieceMap[placement.pieceId];
    const footprint = footprintByIndex.get(boardIndex) ?? null;
    const checkpointIndices = checkpoints
      .map((checkpoint, index) => (
        pointOnPlacement(checkpoint, placement, pieceMap) ? index + 1 : null
      ))
      .filter(Number.isInteger);
    const directRouteUse = (Number(footprint?.uniqueRouteTiles) || 0) > 0;
    const hasCheckpoint = checkpointIndices.length > 0;
    const structuralProtected = protectedSandwichBoards.has(boardIndex);
    const wholeCourseMaterialRetained = wholeCourseMaterialRetainedPieceIds.has(
      placement.pieceId
    );

    let minimumTrackedRouteDistance = null;
    if (piece && routeTiles.length) {
      for (const { x, y } of getPlacementOccupiedOffsets(
        piece,
        placement.rotation ?? 0
      )) {
        const absoluteX = placement.x + x;
        const absoluteY = placement.y + y;
        for (const routePoint of routeTiles) {
          const distance = Math.abs(routePoint.x - absoluteX) +
            Math.abs(routePoint.y - absoluteY);
          minimumTrackedRouteDistance = minimumTrackedRouteDistance == null
            ? distance
            : Math.min(minimumTrackedRouteDistance, distance);
          if (minimumTrackedRouteDistance === 0) break;
        }
        if (minimumTrackedRouteDistance === 0) break;
      }
    }

    const overlayNearTrackedPlay = (overlayPlacements || []).some(
      (overlayPlacement) => {
        const overlayPiece = pieceMap[overlayPlacement.pieceId];
        if (!overlayPiece) return false;
        const sitsOnBoard = getPlacementOccupiedOffsets(
          overlayPiece,
          overlayPlacement.rotation ?? 0
        ).some(({ x, y }) => (
          pointOnPlacement(
            {
              x: overlayPlacement.x + x,
              y: overlayPlacement.y + y
            },
            placement,
            pieceMap
          )
        ));
        return sitsOnBoard && overlayTouchesTrackedPlay(
          overlayPlacement,
          pieceMap,
          routeTileKeys,
          checkpoints,
          2
        );
      }
    );

    const demonstratedReasons = [];
    if (directRouteUse) demonstratedReasons.push("direct-route");
    if (hasCheckpoint) demonstratedReasons.push("checkpoint");
    if (structuralProtected) demonstratedReasons.push("structural-variant");
    if (wholeCourseMaterialRetained) {
      demonstratedReasons.push("whole-course-ablation-material");
    }

    const currentLegacyRetentionReasons = [];
    if (
      !directRouteUse &&
      !hasCheckpoint &&
      Number.isFinite(minimumTrackedRouteDistance) &&
      minimumTrackedRouteDistance <= 2
    ) {
      currentLegacyRetentionReasons.push("route-proximity<=2");
    }
    if (!directRouteUse && !hasCheckpoint && overlayNearTrackedPlay) {
      currentLegacyRetentionReasons.push("overlay-near-tracked-play");
    }
    if (structuralProtected) {
      currentLegacyRetentionReasons.push("explicit-protection");
    }
    if (wholeCourseMaterialRetained) {
      currentLegacyRetentionReasons.push("whole-course-material-effect");
    }

    const relevanceDemonstrated = demonstratedReasons.length > 0;
    const hasUndemonstratedIndirectBasis =
      !relevanceDemonstrated &&
      currentLegacyRetentionReasons.length > 0;

    let ablation = null;
    if (
      hasUndemonstratedIndirectBasis &&
      tileMap instanceof Map &&
      fixedRouteField.length
    ) {
      const remainingBoards = boardPlacements.filter(
        (_, index) => index !== boardIndex
      );
      const remainingOverlays = (overlayPlacements || []).filter(
        (overlayPlacement) => (
          overlayFitsWithinBoards(
            overlayPlacement,
            remainingBoards,
            pieceMap
          )
        )
      );
      const ablatedResolved = buildResolvedMap(
        [
          ...remainingBoards,
          ...(dockPlacements || []),
          ...remainingOverlays
        ],
        pieceMap
      );
      ablation = summarizeFixedRouteBoardAblation(
        tileMap,
        ablatedResolved.tileMap,
        fixedRouteField,
        options
      );
    }

    if (ablation?.modeledEffectDetected) {
      demonstratedReasons.push("fixed-route-ablation-effect");
    }

    const indirectEffectDemonstrated =
      Boolean(ablation?.modeledEffectDetected);
    const ablationClear =
      Boolean(ablation) &&
      !ablation.modeledEffectDetected;
    const relevanceStatus = relevanceDemonstrated
      ? "demonstrated"
      : indirectEffectDemonstrated
        ? "demonstrated-indirect"
        : ablationClear
          ? "ablation-clear"
          : hasUndemonstratedIndirectBasis
            ? "pending-ablation"
            : "no-current-evidence";
    const cleanupRecommendation = relevanceDemonstrated
      ? "retain"
      : indirectEffectDemonstrated
        ? "retain-modeled-indirect"
        : ablationClear
          ? "removal-candidate-modeled"
          : hasUndemonstratedIndirectBasis
            ? "hold-pending-ablation"
            : "removal-candidate";

    return {
      boardIndex,
      pieceId: placement.pieceId,
      directRouteUse,
      checkpointCount: checkpointIndices.length,
      checkpointIndices,
      structuralProtected,
      minimumTrackedRouteDistance,
      overlayNearTrackedPlay,
      demonstratedReasons,
      currentLegacyRetentionReasons,
      relevanceDemonstrated:
        relevanceDemonstrated || indirectEffectDemonstrated,
      indirectEffectDemonstrated,
      relevanceStatus,
      needsAblation:
        hasUndemonstratedIndirectBasis && !ablation,
      ablation,
      cleanupRecommendation,
      // Footprint is intentionally copied only as context. It is not evidence
      // that a board is or is not gameplay-relevant.
      footprintScore: Number(footprint?.contributionScore) || 0,
      footprintWeak: Boolean(footprint?.weakUse),
      representativeRegisters: Number(footprint?.representativeRegisters) || 0,
      uniqueRouteTiles: Number(footprint?.uniqueRouteTiles) || 0
    };
  });

  return {
    model: "board-gameplay-relevance-v49eg",
    observationalOnly: false,
    cleanupBehaviorChanged: true,
    cleanupModel: "selected-route-orphan+fixed-route-gate+whole-course-ablation-v49eg",
    demonstratedCount: boards.filter((board) => board.relevanceDemonstrated).length,
    indirectEffectCount: boards.filter(
      (board) => board.indirectEffectDemonstrated
    ).length,
    ablationClearCount: boards.filter(
      (board) => board.relevanceStatus === "ablation-clear"
    ).length,
    pendingAblationCount: boards.filter((board) => board.needsAblation).length,
    removalCandidateCount: boards.filter(
      (board) => String(board.cleanupRecommendation || "").startsWith("removal-candidate")
    ).length,
    boards
  };
}

export function getFinalLegAnticlimax(sequence, preferences = {}) {
  const finalLeg = sequence?.legs?.at(-1);
  if (!finalLeg || sequence.legs.length <= 1) {
    return {
      active: false,
      fastestActions: null,
      penalty: 0,
      routeCount: 0
    };
  }

  const routes = finalLeg.analysis?.distinctRoutes || finalLeg.analysis?.routes || [];
  const actions = routes
    .map((route) => route.actions)
    .filter(Number.isFinite);
  if (!actions.length) {
    return {
      active: false,
      fastestActions: null,
      penalty: 0,
      routeCount: 0
    };
  }

  const fastestActions = Math.min(...actions);
  const shortfall = Math.max(0, 6 - fastestActions);
  const lengthScale = preferences.targetGuidanceOnlyLength
    ? 0.85
    : preferences.length === "short"
      ? 0.25
      : preferences.length === "epic"
        ? 1.5
        : preferences.length === "long"
          ? 1.25
          : 0.85;
  const difficultyScale = preferences.targetGuidanceOnlyDifficulty
    ? 0.9
    : preferences.difficulty === "easy"
      ? 0.55
      : preferences.difficulty === "hard" || preferences.difficulty === "brutal"
        ? 1.15
        : 0.9;
  const penalty = Number((shortfall * shortfall * 3.5 * lengthScale * difficultyScale).toFixed(2));

  return {
    active: penalty > 0,
    fastestActions,
    penalty,
    routeCount: routes.length
  };
}

export function getRoutedCheckpointPacingExpectation(openingLegAnticlimax, intermediateCheckpointPacing, finalLegAnticlimax) {
  // Player-facing checkpoint quality is based on routed register demand, not
  // Manhattan distance. Opening and middle legs use field/route averages, while
  // the final leg protects the catch-up window by requiring more than one normal
  // five-register program for even the fastest route.
  const deviations = [];
  const openingFastest = openingLegAnticlimax?.fastestActions;
  const openingAverage = openingLegAnticlimax?.averageActions;
  if (Number.isFinite(openingFastest) && openingFastest < 4) {
    deviations.push({
      type: "opening-fastest",
      actual: openingFastest,
      expectedMinimum: 4,
      severity: 4 - openingFastest
    });
  }
  if (Number.isFinite(openingAverage) && openingAverage < 6) {
    deviations.push({
      type: "opening-average",
      actual: openingAverage,
      expectedMinimum: 6,
      severity: 6 - openingAverage
    });
  }

  const middleShortest = intermediateCheckpointPacing?.shortestAverageActions;
  const middleAverage = intermediateCheckpointPacing?.averageActions;
  if (Number.isFinite(middleShortest) && middleShortest < 4) {
    deviations.push({
      type: "middle-shortest-average",
      actual: middleShortest,
      expectedMinimum: 4,
      severity: 4 - middleShortest
    });
  }
  if (Number.isFinite(middleAverage) && middleAverage < 6) {
    deviations.push({
      type: "middle-average",
      actual: middleAverage,
      expectedMinimum: 6,
      severity: 6 - middleAverage
    });
  }

  const finalFastest = finalLegAnticlimax?.fastestActions;
  if (Number.isFinite(finalFastest) && finalFastest < 6) {
    deviations.push({
      type: "final-fastest",
      actual: finalFastest,
      expectedMinimum: 6,
      severity: 6 - finalFastest
    });
  }

  return {
    acceptable: deviations.length === 0,
    penalty: Number((
      (Number(openingLegAnticlimax?.penalty) || 0) +
      (Number(intermediateCheckpointPacing?.penalty) || 0) +
      (Number(finalLegAnticlimax?.penalty) || 0)
    ).toFixed(2)),
    deviations
  };
}
