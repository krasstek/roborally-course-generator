// Robo Rally Course Randomizer - reboot token placement (board tokens and Home Reboot)
import { analyzeFlagLeg } from "../../analyze.js";
import { rotatedDimensions } from "../../board.js";
import { FACINGS } from "./config.js";
import {
  getPlacementOccupiedOffsets,
  getWallsAtTile,
  manhattanDistance,
  pointOnPlacement,
  pointOnRect
} from "./layout-geometry.js";

export function isUnsafeRebootQueueTile(tile) {
  return (tile?.features || []).some((feature) => (
    feature.type === "pit" ||
    feature.type === "trapdoor" ||
    feature.type === "crusher"
  ));
}

export function canStepForReboot(tileMap, boardRect, from, dir) {
  const delta = {
    N: { dx: 0, dy: -1 },
    E: { dx: 1, dy: 0 },
    S: { dx: 0, dy: 1 },
    W: { dx: -1, dy: 0 }
  }[dir];
  const opposite = {
    N: "S",
    E: "W",
    S: "N",
    W: "E"
  }[dir];
  const to = {
    x: from.x + delta.dx,
    y: from.y + delta.dy
  };

  if (!pointOnRect(to, boardRect)) {
    return false;
  }

  const fromTile = tileMap.get(`${from.x},${from.y}`);
  const toTile = tileMap.get(`${to.x},${to.y}`);
  if (!toTile || isUnsafeRebootQueueTile(toTile)) {
    return false;
  }

  const fromWalls = getWallsAtTile(fromTile);
  const toWalls = getWallsAtTile(toTile);
  if (fromWalls.has(dir) || toWalls.has(opposite)) {
    return false;
  }

  return true;
}

export function scoreRebootDirection(tileMap, boardRect, point, dir, requiredRunway) {
  let runway = 0;
  let current = point;

  while (canStepForReboot(tileMap, boardRect, current, dir)) {
    const delta = {
      N: { dx: 0, dy: -1 },
      E: { dx: 1, dy: 0 },
      S: { dx: 0, dy: 1 },
      W: { dx: -1, dy: 0 }
    }[dir];
    current = {
      x: current.x + delta.dx,
      y: current.y + delta.dy
    };
    runway += 1;
  }

  if (runway < requiredRunway) {
    return null;
  }

  // Preserve the established placement preference cap: once a direction has
  // enough capacity, extra runway beyond three squares does not make the token
  // otherwise more desirable.
  return Math.min(runway, 3) * 4;
}

export function placeRebootTokens(boardRects, tileMap, checkpoints, playerCount) {
  // The token square is the first simultaneous-reboot position. The arrow must
  // provide one additional safe square per remaining player so every robot can
  // be placed without looping back through an occupied or lethal reboot space.
  const requiredRunway = Math.max(0, Math.floor(Number(playerCount) || 1) - 1);
  const dirs = ["N", "E", "S", "W"];
  const tokens = [];

  for (const boardRect of boardRects) {
    const center = {
      x: boardRect.x + (boardRect.width - 1) / 2,
      y: boardRect.y + (boardRect.height - 1) / 2
    };
    let best = null;

    for (let y = boardRect.y; y < boardRect.y + boardRect.height; y += 1) {
      for (let x = boardRect.x; x < boardRect.x + boardRect.width; x += 1) {
        const point = { x, y };
        const tile = tileMap.get(`${x},${y}`) ?? { features: [] };
        const features = tile.features || [];

        if (checkpoints.some((checkpoint) => checkpoint.x === x && checkpoint.y === y)) {
          continue;
        }

        if (isUnsafeRebootQueueTile(tile)) {
          continue;
        }

        const nonPassivePenalty = features.reduce((sum, feature) => {
          if (feature.type === "wall" || feature.type === "laser" || feature.type === "checkpoint") {
            return sum;
          }
          return sum + 5;
        }, 0);
        const nearestCheckpoint = checkpoints.length
          ? Math.min(...checkpoints.map((checkpoint) => manhattanDistance(point, checkpoint)))
          : 99;
        const centerDistance = Math.abs(point.x - center.x) + Math.abs(point.y - center.y);

        for (const dir of dirs) {
          const directionScore = scoreRebootDirection(tileMap, boardRect, point, dir, requiredRunway);
          if (directionScore === null) {
            continue;
          }

          const score = (
            nearestCheckpoint * 2.5 +
            directionScore * 3 -
            centerDistance * 3 -
            nonPassivePenalty
          );

          if (!best || score > best.score) {
            best = {
              boardIndex: boardRect.index,
              pieceId: boardRect.pieceId,
              x,
              y,
              dir,
              score
            };
          }
        }
      }
    }

    if (best) {
      tokens.push(best);
    }
  }

  return tokens;
}

export function canTraceRouteFromHomeRebootTile(tileMap, point, checkpoints = [], options = {}) {
  return checkpoints.some((checkpoint) => {
    const analysis = analyzeFlagLeg(tileMap, point, checkpoint, {
      facings: FACINGS,
      routesPerFacing: 1,
      maxDistinctRoutes: 1,
      maxExpansions: 8000,
      playerCount: 1,
      recoveryRule: "dynamic_archiving",
      lessDeadlyGame: options.lessDeadlyGame
    });

    return Number.isFinite(analysis.summary.bestRouteScore);
  });
}

export function placeHomeRebootTokens(dockPlacements, pieceMap, starts = [], tileMap, checkpoints = [], options = {}) {
  const tokens = [];
  const startKeys = new Set(starts.map((start) => `${start.x},${start.y}`));
  const checkpointKeys = new Set(checkpoints.map((checkpoint) => `${checkpoint.x},${checkpoint.y}`));

  dockPlacements.forEach((dockPlacement, dockIndex) => {
    const dockStarts = starts.filter((start) => pointOnPlacement(start, dockPlacement, pieceMap));
    if (!dockStarts.length) {
      return;
    }

    const piece = pieceMap[dockPlacement.pieceId];
    const occupiedOffsets = getPlacementOccupiedOffsets(piece, dockPlacement.rotation ?? 0);
    const candidatePoints = occupiedOffsets
      .map((offset) => ({
        x: dockPlacement.x + offset.x,
        y: dockPlacement.y + offset.y
      }))
      .filter((point) => !startKeys.has(`${point.x},${point.y}`))
      .filter((point) => !checkpointKeys.has(`${point.x},${point.y}`))
      .filter((point) => {
        const tile = tileMap?.get(`${point.x},${point.y}`) ?? { features: [] };
        return !(tile.features || []).some((feature) => feature.type === "pit");
      })
      .filter((point) => canTraceRouteFromHomeRebootTile(tileMap, point, checkpoints, options));

    if (!candidatePoints.length) {
      return;
    }

    const dims = rotatedDimensions(piece, dockPlacement.rotation ?? 0);
    const center = {
      x: dockPlacement.x + (dims.width - 1) / 2,
      y: dockPlacement.y + (dims.height - 1) / 2
    };
    const token = candidatePoints
      .sort((left, right) => {
        const leftDistance = Math.abs(left.x - center.x) + Math.abs(left.y - center.y);
        const rightDistance = Math.abs(right.x - center.x) + Math.abs(right.y - center.y);
        return leftDistance - rightDistance || left.y - right.y || left.x - right.x;
      })[0];

    tokens.push({
      dockIndex,
      pieceId: dockPlacement.pieceId,
      x: token.x,
      y: token.y,
      startKeys: dockStarts.map((start) => `${start.x},${start.y}`)
    });
  });

  return tokens;
}
