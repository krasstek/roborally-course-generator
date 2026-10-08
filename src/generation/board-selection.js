// Robo Rally Course Randomizer - board selection: requirement-covering choice of board faces
import { countPhysicalBoards, getPhysicalBoardId } from "./layout-geometry.js";
import { sample, sampleManyWeighted, shuffle } from "./random.js";
import { boardPieceSatisfiesConstructionRequirement } from "./variant-availability.js";

export function sampleDistinctBoardFaces(boardIds, count, pieceMap) {
  const pool = shuffle(boardIds);
  const selected = [];
  const usedPhysicalBoards = new Set();

  for (const boardId of pool) {
    const physicalBoardId = getPhysicalBoardId(pieceMap[boardId]);
    if (usedPhysicalBoards.has(physicalBoardId)) {
      continue;
    }

    selected.push(boardId);
    usedPhysicalBoards.add(physicalBoardId);

    if (selected.length >= count) {
      break;
    }
  }

  return selected;
}

export function smallBoardCompositionPenalty(boardIds, pieceMap) {
  const smallCount = boardIds.filter((boardId) => pieceMap[boardId]?.kind === "small").length;
  if (smallCount === 1) {
    return 1.8;
  }
  if (smallCount >= 2) {
    return 0.4;
  }
  return 0;
}

export function boardSelectionCompositionPenalty(boardIds, pieceMap) {
  // Neutral composition quality only. A lone small board mixed into a large
  // layout tends to produce awkward geometry; this is not a target prediction.
  return smallBoardCompositionPenalty(boardIds, pieceMap);
}

export function getBoardRequirementCoverage(boardId, pieceMap, requirements = [], options = {}) {
  const piece = pieceMap[boardId];
  const covered = new Set();
  requirements.forEach((requirement, index) => {
    if (boardPieceSatisfiesConstructionRequirement(piece, requirement, options)) {
      covered.add(index);
    }
  });
  return covered;
}

export function chooseRequirementCoveringBoardIds(boardIds, count, pieceMap, requirements = [], options = {}) {
  if (!requirements.length) {
    return sampleDistinctBoardFaces(boardIds, count, pieceMap);
  }

  const coverageByBoard = new Map(boardIds.map((boardId) => [
    boardId,
    getBoardRequirementCoverage(boardId, pieceMap, requirements, options)
  ]));
  const allRequirementIndexes = requirements.map((_, index) => index);
  const selectionPredicate = typeof options.selectionPredicate === "function"
    ? options.selectionPredicate
    : () => true;

  const fillSelection = (selected, usedPhysicalBoards) => {
    const remainingSlots = count - selected.length;
    if (remainingSlots < 0) return null;
    if (remainingSlots === 0) {
      return selectionPredicate(selected) ? selected : null;
    }

    const availableBoardIds = boardIds.filter((boardId) => (
      !usedPhysicalBoards.has(getPhysicalBoardId(pieceMap[boardId]))
    ));
    if (countPhysicalBoards(availableBoardIds, pieceMap) < remainingSlots) {
      return null;
    }

    const completeFromOrder = (orderedBoardIds) => {
      const completed = [...selected];
      const completedPhysicalBoards = new Set(usedPhysicalBoards);
      for (const boardId of orderedBoardIds) {
        const physicalBoardId = getPhysicalBoardId(pieceMap[boardId]);
        if (completedPhysicalBoards.has(physicalBoardId)) continue;
        completed.push(boardId);
        completedPhysicalBoards.add(physicalBoardId);
        if (completed.length === count) break;
      }
      return completed.length === count && selectionPredicate(completed)
        ? completed
        : null;
    };

    // v49eu: v49et recursively enumerated filler-board permutations here.
    // When a feature-covering core could not also satisfy dock frontage, that
    // synchronous recursion could monopolize the browser main thread and make
    // generation appear frozen. A handful of randomized completions preserves
    // ordinary composition diversity without unbounded filler backtracking.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const completed = completeFromOrder(shuffle(availableBoardIds));
      if (completed) return completed;
    }

    // The only production selection predicate today is dock-span feasibility.
    // Choosing the widest available face from each unused physical board and
    // trying those groups in descending span order is therefore an exact
    // fallback for that constraint: if this completion cannot reach the dock
    // frontage, no other filler choice for this fixed requirement core can.
    // Keep the final predicate call authoritative so future predicates remain
    // safe even though they may need their own explicit completion strategy.
    const bestFaceByPhysicalBoard = new Map();
    for (const boardId of availableBoardIds) {
      const physicalBoardId = getPhysicalBoardId(pieceMap[boardId]);
      const piece = pieceMap[boardId];
      const span = Math.max(piece?.width ?? 0, piece?.height ?? 0);
      const current = bestFaceByPhysicalBoard.get(physicalBoardId);
      if (!current || span > current.span) {
        bestFaceByPhysicalBoard.set(physicalBoardId, { boardId, span });
      }
    }
    const maximumSpanOrder = [...bestFaceByPhysicalBoard.values()]
      .sort((left, right) => right.span - left.span)
      .map((entry) => entry.boardId);
    return completeFromOrder(maximumSpanOrder);
  };

  const search = (selected, usedPhysicalBoards, uncovered) => {
    if (!uncovered.length) {
      return fillSelection(selected, usedPhysicalBoards);
    }
    if (selected.length >= count) return null;

    const rankedRequirements = uncovered
      .map((requirementIndex) => ({
        requirementIndex,
        candidateBoardIds: boardIds.filter((boardId) => {
          const physicalBoardId = getPhysicalBoardId(pieceMap[boardId]);
          return !usedPhysicalBoards.has(physicalBoardId) && coverageByBoard.get(boardId)?.has(requirementIndex);
        })
      }))
      .filter((entry) => entry.candidateBoardIds.length)
      .sort((left, right) => left.candidateBoardIds.length - right.candidateBoardIds.length);

    const target = rankedRequirements[0];
    if (!target) return null;

    const orderedCandidates = shuffle(target.candidateBoardIds).sort((left, right) => (
      (coverageByBoard.get(right)?.size ?? 0) - (coverageByBoard.get(left)?.size ?? 0)
    ));

    for (const boardId of orderedCandidates) {
      const physicalBoardId = getPhysicalBoardId(pieceMap[boardId]);
      const boardCoverage = coverageByBoard.get(boardId) ?? new Set();
      const nextUncovered = uncovered.filter((index) => !boardCoverage.has(index));
      const result = search(
        [...selected, boardId],
        new Set([...usedPhysicalBoards, physicalBoardId]),
        nextUncovered
      );
      if (result) return result;
    }

    return null;
  };

  return search([], new Set(), allRequirementIndexes) ?? [];
}

export function getMinimumBoardCountForConstructionRequirements(boardIds, maxBoards, pieceMap, requirements = [], options = {}) {
  if (!requirements.length) return 1;
  for (let count = 1; count <= maxBoards; count += 1) {
    if (chooseRequirementCoveringBoardIds(boardIds, count, pieceMap, requirements, options).length === count) {
      return count;
    }
  }
  return null;
}

export function selectBoardIdsForCourse(boardIds, count, pieceMap, options = {}) {
  const candidates = [];
  const attempts = Math.min(48, Math.max(12, boardIds.length * 2));
  const requirements = options.requirements ?? [];

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const selectedBoardIds = chooseRequirementCoveringBoardIds(
      boardIds,
      count,
      pieceMap,
      requirements,
      options
    );
    if (selectedBoardIds.length !== count) continue;
    const penalty = boardSelectionCompositionPenalty(selectedBoardIds, pieceMap);
    candidates.push({
      selectedBoardIds,
      weight: 1 / (1 + Math.max(0, penalty))
    });
  }

  if (!candidates.length) {
    return { subsetBoardIds: [], selectedBoardIds: [] };
  }

  const selected = sampleManyWeighted(candidates, 1)[0] ?? sample(candidates);
  return {
    subsetBoardIds: [...boardIds],
    selectedBoardIds: selected?.selectedBoardIds ?? []
  };
}
