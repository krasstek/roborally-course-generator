// Robo Rally Course Randomizer - reboot token placement (board tokens and Home Reboot)
import { analyzeFlagLeg } from "../../analyze.js";
import { rotatedDimensions } from "../../board.js";
import { isBoundaryBlockedByWalls } from "../analysis/board-geometry.js";
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

// crossBoards: the reboot queue may continue onto a neighbouring board (or off
// an overlay onto the board underneath); used only when it cannot fit inside.
export function canStepForReboot(tileMap, boardRect, from, dir, crossBoards = false) {
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

  if (!crossBoards && !pointOnRect(to, boardRect)) {
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

export function scoreRebootDirection(tileMap, boardRect, point, dir, requiredRunway, crossBoards = false) {
  let runway = 0;
  let current = point;

  while (canStepForReboot(tileMap, boardRect, current, dir, crossBoards)) {
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

const ROBOT_DESTROYING_FEATURES = new Set(["pit", "trapdoor", "crusher", "teleporter"]);
const SIDE_STEPS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

// Whether a robot can ever be destroyed on this area, i.e. whether it needs a
// reboot token. A robot is destroyed by a pit, an open trapdoor or a crusher on
// the square, by leaving the course through an outer side with no wall (unless
// Walled In makes the edges walls), or by a teleporter jump landing off the
// course or in a pit (Walled In does not stop a jump). Damage never destroys.
// Squares inside excludedRects belong to an overlay board with its own token.
export function areaCanDestroyRobot(rect, tileMap, { lessDeadlyGame = false, excludedRects = [] } = {}) {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const point = { x, y };
      if (excludedRects.some((excluded) => pointOnRect(point, excluded))) continue;
      const tile = tileMap.get(`${x},${y}`);
      if (!tile) continue;
      if ((tile.features || []).some((feature) => ROBOT_DESTROYING_FEATURES.has(feature.type))) {
        return true;
      }
      if (lessDeadlyGame) continue;
      for (const [side, [dx, dy]] of Object.entries(SIDE_STEPS)) {
        const to = { x: x + dx, y: y + dy };
        if (!tileMap.has(`${to.x},${to.y}`) && !isBoundaryBlockedByWalls(tileMap, point, to, side)) {
          return true;
        }
      }
    }
  }
  return false;
}

// overlayRects: 6x6 overlay boards that get their own token (Overlay Reboot
// Tokens: own). Their tokens carry the overlay's rect, which recovery matches
// before the main board, and main-board tokens stay off overlay squares.
// Returns { tokens, missingCount }: an area where no robot can be destroyed gets
// no token (and is not missing); missingCount counts areas that needed one but
// had no legal square.
export function placeRebootTokens(boardRects, tileMap, checkpoints, playerCount, overlayRects = [], { lessDeadlyGame = false } = {}) {
  // The token square is the first simultaneous-reboot position. The arrow must
  // provide one additional safe square per remaining player so every robot can
  // be placed without looping back through an occupied or lethal reboot space.
  const requiredRunway = Math.max(0, Math.floor(Number(playerCount) || 1) - 1);
  const dirs = ["N", "E", "S", "W"];
  const tokens = [];
  const areas = [
    ...boardRects.map((rect) => ({ rect, overlay: false })),
    ...overlayRects.map((rect) => ({ rect, overlay: true }))
  ];

  let missingCount = 0;

  for (const { rect: boardRect, overlay } of areas) {
    if (!areaCanDestroyRobot(boardRect, tileMap, {
      lessDeadlyGame,
      excludedRects: overlay ? [] : overlayRects
    })) {
      continue;
    }
    // A queue that fits inside the board keeps today's choice; only a board too
    // small for the player count (e.g. a 6x6 at 7-8 players) lets it continue
    // onto the next board. A lone 6x6 board still cannot fit 8 robots.
    const best = findRebootTokenForArea(boardRect, overlay, false) ??
      findRebootTokenForArea(boardRect, overlay, true);
    if (best) {
      tokens.push(best);
    } else {
      missingCount += 1;
    }
  }

  return { tokens, missingCount };

  function findRebootTokenForArea(boardRect, overlay, crossBoards) {
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

        if (!overlay && overlayRects.some((overlayRect) => pointOnRect(point, overlayRect))) {
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
          const directionScore = scoreRebootDirection(tileMap, boardRect, point, dir, requiredRunway, crossBoards);
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
            best = overlay
              ? {
                boardIndex: null,
                pieceId: boardRect.pieceId,
                overlayRect: {
                  x: boardRect.x,
                  y: boardRect.y,
                  width: boardRect.width,
                  height: boardRect.height
                },
                x,
                y,
                dir,
                score
              }
              : {
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

    return best;
  }
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
