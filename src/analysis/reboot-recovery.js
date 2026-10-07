// Robo Rally Course Randomizer - reboot recovery (tokens, home reboot, lost registers) and register-position helpers
import { getDamageDeckPressureMultipliers } from "../../feature-weights.js";
import { cloneState, tileKey } from "./board-geometry.js";
import {
  MORE_DEADLY_REBOOT_DAMAGE_PENALTY,
  REBOOT_AVERAGE_LOST_REGISTERS,
  REBOOT_DAMAGE_PENALTY,
  REGISTER_COUNT,
  REGISTER_TEMPO_COST,
  ROTATION_ORDER
} from "./constants.js";

export function getBoardRectForPoint(point, boardRects = []) {
  return boardRects.find((rect) => (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  )) ?? null;
}

export function getRebootTokenForPoint(point, boardRects = [], rebootTokens = []) {
  const boardRect = getBoardRectForPoint(point, boardRects);
  if (!boardRect) {
    return null;
  }

  return rebootTokens.find((token) => token.boardIndex === boardRect.index) ?? null;
}

export function getRebootChoicesForPoint(point) {
  if (!point) return [];
  return ROTATION_ORDER.map((facing) => ({
    x: point.x,
    y: point.y,
    facing
  }));
}

export function getHomeRebootChoices(rebootTokens = []) {
  return rebootTokens.flatMap((token) => getRebootChoicesForPoint(token));
}

// v48zo cheap recovery split: pressure/scoring callers need only the recovery
// coordinate, while an actual reboot also needs the four facing choices. Keep the
// generalized recovery semantics in one point resolver, then materialize choices
// only for factual reboot execution. This avoids allocating recovery-choice arrays
// during the very hot autokill-pressure path.
export function resolveRebootRecoveryPoint(state, crashPoint, options = {}, { offBoard = false } = {}) {
  if (!state) return null;

  if (options.recoveryRule === "reboot_tokens") {
    const departureBoard = getBoardRectForPoint(state, options.boardRects);
    if (offBoard && !departureBoard && options.rebootStart) {
      return {
        source: "dock_start",
        point: { x: options.rebootStart.x, y: options.rebootStart.y }
      };
    }

    const crashBoard = crashPoint
      ? getBoardRectForPoint(crashPoint, options.boardRects)
      : null;
    const referenceBoard = crashBoard ?? departureBoard;
    if (!referenceBoard) return null;
    const token = (options.rebootTokens || []).find(
      (candidate) => candidate.boardIndex === referenceBoard.index
    ) ?? null;
    if (!token) return null;
    return {
      source: "board_reboot_token",
      point: { x: token.x, y: token.y }
    };
  }

  if (options.recoveryRule === "home_reboot") {
    const token = (options.rebootTokens || [])[0] ?? null;
    if (!token) return null;
    return {
      source: "home_reboot",
      point: { x: token.x, y: token.y }
    };
  }

  if (options.recoveryRule === "dynamic_archiving") {
    const archive = options.dynamicArchivePoint;
    if (!archive) return null;
    return {
      source: "dynamic_archive",
      point: { x: archive.x, y: archive.y }
    };
  }

  return null;
}

// v48zc common recovery resolver. Autokill mechanics are shared; recovery rules
// differ only in how they choose the destination. Normal reboot-token mode has
// one special rule: leaving the outer edge of the dock recovers this robot on
// its own starting space rather than on a board reboot token. Dynamic Archiving
// supplies the route's current archive point. Home Reboot supplies its allowed
// home tokens. The common reboot executor below handles damage, turn-ending and
// relocation identically after this resolver returns.
export function resolveRebootRecovery(state, crashPoint, options = {}, recoveryOptions = {}) {
  const resolved = resolveRebootRecoveryPoint(
    state,
    crashPoint,
    options,
    recoveryOptions
  );
  if (!resolved) return null;

  const choices = options.recoveryRule === "home_reboot"
    ? getHomeRebootChoices(options.rebootTokens)
    : getRebootChoicesForPoint(resolved.point);
  if (!choices.length) return null;

  return {
    ...resolved,
    choices
  };
}

export function getRebootTransitionCore(state, crashPoint, options = {}, recoveryOptions = {}) {
  if (options.contextualDeferRebootRecovery) {
    return {
      state: cloneState(state),
      rebootChoices: null,
      rebootRecoverySource: null,
      hazard: 0,
      rebootPenalty: 0,
      crashed: false,
      rebooted: true,
      pendingReboot: {
        state: cloneState(state),
        crashPoint: crashPoint ? { x: crashPoint.x, y: crashPoint.y } : null,
        offBoard: Boolean(recoveryOptions.offBoard)
      }
    };
  }

  const recovery = resolveRebootRecovery(
    state,
    crashPoint,
    options,
    recoveryOptions
  );
  if (!recovery) return null;
  return {
    state: {
      x: recovery.point.x,
      y: recovery.point.y,
      facing: state.facing
    },
    rebootChoices: recovery.choices,
    rebootRecoverySource: recovery.source,
    hazard: getRebootDamagePenalty(options),
    rebootPenalty: getRebootRoutePenalty(),
    crashed: false,
    rebooted: true
  };
}

export function getHomeRebootTokensForStart(start, rebootTokens = []) {
  const startKeyValue = tileKey(start.x, start.y);
  return rebootTokens.filter((token) => (token.startKeys || []).includes(startKeyValue));
}

export function getRebootDamagePenalty(options = {}) {
  const basePenalty = options.moreDeadlyGame ? MORE_DEADLY_REBOOT_DAMAGE_PENALTY : REBOOT_DAMAGE_PENALTY;
  return Number((basePenalty * getDamageDeckPressureMultipliers(options).reboot).toFixed(2));
}

export function getRegisterPosition(actionCount) {
  return ((Math.max(1, actionCount) - 1) % REGISTER_COUNT) + 1;
}

// v48z reboot chronology invariant: `absoluteActions` is the elapsed register
// clock, not merely the number of route cards that physically executed. A reboot
// action occurs in its real register, then ends that five-register program and
// advances the clock to the next turn boundary. `route.actions`/`localActions`
// continue to count only cards that actually execute, so the skipped registers
// are priced once by the explicit reboot lost-register penalty instead of being
// fabricated as extra WAIT/actions.
export function getRebootLostRegisters(actionCount) {
  return REGISTER_COUNT - getRegisterPosition(actionCount);
}

export function getRebootEndedAbsoluteActions(actionCount) {
  const executed = Math.max(0, Math.floor(Number(actionCount) || 0));
  if (executed <= 0) return 0;
  return executed + getRebootLostRegisters(executed);
}

export function getTransitionAbsoluteAction(transition, fallbackAbsoluteAction) {
  const explicit = Number(transition?.absoluteAction);
  return Number.isFinite(explicit) && explicit > 0
    ? Math.floor(explicit)
    : Math.max(1, Math.floor(Number(fallbackAbsoluteAction) || 1));
}

export function getElapsedAbsoluteActionsAfterTransitions(
  transitions = [],
  absoluteStartAction = 0,
  count = null
) {
  const safeTransitions = Array.isArray(transitions) ? transitions : [];
  const limit = count === null
    ? safeTransitions.length
    : Math.max(0, Math.min(safeTransitions.length, Math.floor(Number(count) || 0)));
  let elapsed = Math.max(0, Math.floor(Number(absoluteStartAction) || 0));
  for (let index = 0; index < limit; index += 1) {
    const transition = safeTransitions[index];
    const executed = getTransitionAbsoluteAction(transition, elapsed + 1);
    elapsed = transition?.rebooted
      ? getRebootEndedAbsoluteActions(executed)
      : executed;
  }
  return elapsed;
}


export function getTurnEndAfterActionIndexes(transitions = []) {
  const out = new Set();
  (Array.isArray(transitions) ? transitions : []).forEach((transition, index) => {
    if (transition?.rebooted) out.add(index);
  });
  return out;
}

export function getRebootRoutePenalty(actionCount = null) {
  const lostRegisters = Number.isFinite(actionCount)
    ? getRebootLostRegisters(actionCount)
    : REBOOT_AVERAGE_LOST_REGISTERS;

  // Search and replay price only the concrete skipped-register tempo here.
  // Direct reboot damage remains separate hazard/damage guidance and final mental
  // disruption belongs to completed-route mental RE.
  return Number((lostRegisters * REGISTER_TEMPO_COST).toFixed(2));
}
