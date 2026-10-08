// Robo Rally Course Randomizer - play time: wall-clock player multipliers, Act Fast timing and pressure, reference play-time bands
import { clamp } from "../shared/math.js";

// v49dl provisional elapsed-play calibration. These coefficients are explicit
// empirical anchors, not hidden semantic weights. They were chosen against the
// accepted fixed-seed 4-player Short/Medium/Long/Epic batch so the new
// adverse-RE model reproduces the previously accepted approximate game-turn
// scale while preserving burden intensity as a separate input.
export const PLAY_TIME_RESPONSE_MAX_UPLIFT = 0.60;
export const PLAY_TIME_HORIZON_MIDPOINT_TURNS = 7.0;
export const PLAY_TIME_HORIZON_SLOPE_TURNS = 1.5;
// v49ds transitional unit bridge. Production route/play length is now entirely
// expected-play extent: nominal programmed registers plus calibrated RE-native
// recovery/amplification. Four raw points per expected-play register preserves
// the accepted 4-player Short/Medium/Long/Epic calibration anchors closely
// enough to keep the existing raw-score bands usable while route distance and
// standalone congestion stop voting independently. This is a score-space unit
// conversion, not an additional semantic owner; final wall-clock bands will
// replace it later.
export const LENGTH_EXPECTED_PLAY_RAW_POINTS_PER_REGISTER = 4.0;
// v49dt provisional wall-clock calibration. Four players remain the 1.0
// reference. Each additional/removed player changes the per-turn table-time
// multiplicatively rather than through a fixed additive length tax. The
// logarithmic slope gives a smooth ~10% step per player and makes an 8-player
// table materially slower without tripling the estimate.
export const WALL_CLOCK_PLAYER_LOG_SLOPE = 0.11;
export const WALL_CLOCK_PLAYER_MULTIPLIER_MIN = 0.65;
export const WALL_CLOCK_PLAYER_MULTIPLIER_MAX = 1.65;
// v49du provisional non-register economy-time calibration. These are relative
// wall-clock register-index units, not literal programmed registers or minutes.
// A paid upgrade-card draw and an upgrade install/play are the only transaction
// primitives promoted into time. Energy gains and abstract install-investment
// units affect whether those transactions are useful, but do not get separate
// time taxes.
export const ENERGY_ECONOMY_DRAW_EVENT_WALL_CLOCK_REGISTERS = 0.35;
export const ENERGY_ECONOMY_INSTALL_EVENT_WALL_CLOCK_REGISTERS = 0.50;

// Act Fast has two deliberately separate mechanisms in v49dt:
// 1) time pressure amplifies non-tempo RE burden, which can indirectly extend
//    expected play through mistakes/recovery; and
// 2) the explicit timer can directly shorten the programming phase.
// Even the 3m/2m modes carry some pressure. Their direct clock saving is near
// zero at small tables and grows with player count, while 1m/30s retain a
// meaningful direct effect even with few players.
export const ACT_FAST_RE_PRESSURE_MAX_UPLIFT = 0.18;
export const ACT_FAST_WALL_CLOCK_PLAYER_EXPOSURE_EXPONENT = 1.5;
export const ACT_FAST_DIRECT_TIMER_REDUCTION = Object.freeze({
  countdown_3m: { low: 0.00, high: 0.04 },
  countdown_2m: { low: 0.005, high: 0.09 },
  last_player_30s: { low: 0.01, high: 0.13 },
  countdown_1m: { low: 0.05, high: 0.24 },
  countdown_30s: { low: 0.14, high: 0.38 }
});

export function getPlayerWallClockMultiplier(playerCount = 4) {
  const players = Math.max(1, Number(playerCount) || 4);
  return clamp(
    Math.exp(WALL_CLOCK_PLAYER_LOG_SLOPE * (players - 4)),
    WALL_CLOCK_PLAYER_MULTIPLIER_MIN,
    WALL_CLOCK_PLAYER_MULTIPLIER_MAX
  );
}

export function getActFastREPressureMultiplier(mode) {
  const weight = getActFastPressureWeight(mode);
  return 1 + ACT_FAST_RE_PRESSURE_MAX_UPLIFT * weight;
}

export function getActFastDirectTimerReduction(mode, playerCount = 4) {
  const config = ACT_FAST_DIRECT_TIMER_REDUCTION[mode];
  if (!config) return 0;
  const players = Math.max(1, Number(playerCount) || 4);
  const normalizedExposure = clamp((players - 2) / 6, 0, 1);
  const exposure = normalizedExposure ** ACT_FAST_WALL_CLOCK_PLAYER_EXPOSURE_EXPONENT;
  return clamp(
    config.low + (config.high - config.low) * exposure,
    0,
    0.6
  );
}

export function getActFastDirectTimingMultiplier(mode, playerCount = 4) {
  return 1 - getActFastDirectTimerReduction(mode, playerCount);
}
export const PLAY_TIME_REFERENCE_TURN_BANDS = Object.freeze({
  short: [0, 6.25],
  moderate: [6.25, 9.5],
  long: [9.5, 13.0],
  epic: [13.0, Infinity]
});

export function getPlayTimeHorizonActivation(nominalProgrammingTurns = 0) {
  const turns = Math.max(0, Number(nominalProgrammingTurns) || 0);
  return 1 / (1 + Math.exp(
    -(turns - PLAY_TIME_HORIZON_MIDPOINT_TURNS) /
      PLAY_TIME_HORIZON_SLOPE_TURNS
  ));
}

export function classifyReferencePlayTimeTurns(programmingTurns = 0) {
  const turns = Math.max(0, Number(programmingTurns) || 0);
  for (const [label, [min, max]] of Object.entries(PLAY_TIME_REFERENCE_TURN_BANDS)) {
    if (turns >= min && turns < max) return label;
  }
  return "epic";
}

export function getActFastPressureWeight(mode) {
  // v49dt: every explicit timer creates some programming pressure, including
  // the slower 3m/2m modes. This weight is dimensionless and is used by the
  // RE-pressure channel; direct wall-clock saving is modeled separately.
  return ({
    countdown_3m: 0.08,
    countdown_2m: 0.20,
    last_player_30s: 0.35,
    countdown_1m: 0.65,
    countdown_30s: 1
  })[mode] ?? 0;
}
