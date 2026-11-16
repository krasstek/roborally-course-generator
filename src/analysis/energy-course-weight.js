// Robo Rally Course Randomizer - course weight for Energy's worth (disruption cards)
//
// About a quarter of what Energy buys is disruption: upgrades that push, pull or
// scramble other robots. Their worth depends on the course: how often a robot
// has a robot-laser line on an opponent, and how much a push hurts there. The
// Energy value table is built for the average course (weight 1); this module
// measures a course's weight and turns it into a multiplier on Energy's worth.
//
// Weight = course push cost / the golden courses' average, clamped to the
// simulated range 0..2. Course push cost = robot-laser shots per register per
// opponent (traffic model; per opponent because robots block each other's line
// of fire, and Energy's worth does not depend on player count, user 2026-11-16)
// x cost of one push. Cost of one push (clog study 2026-11-16): clog weight
// 1.5 + 0.31 x registers left in the turn, plus its reboot chance x 3 clog units;
// taken at the average register (2 left).
//
// Speed: search keeps the average course; only start fairness / difficulty and
// start pricing, which already combine route and traffic RE, use the course
// weight (applied to the Energy line of the RE ledger).
import { ENERGY_VALUE_DISRUPTION_MULTIPLIERS } from "./energy-value-table.js";
import { getRebootExposureSum } from "./movement.js";
import { getStandardRobotLaserCost } from "./traffic.js";
import { clamp } from "../shared/math.js";

export const ENERGY_COURSE_PUSH_COST = Object.freeze({
  clogWeight: 1.5,
  clogWeightPerLaterRegister: 0.31,
  averageLaterRegisters: 2,
  rebootClogLoad: 3,
  rebootHazard: Object.freeze({ base: 0.010, perLaterRegister: 0.025, perExposure: 0.15 }),
  // Planned squares from a push to the turn's end (the push square, its own
  // register's square and the later ones), for the rest-of-turn exposure.
  restOfTurnSquares: 4
});
// Golden courses' average course push cost (shots per register per opponent x
// push cost), measured 2026-11-16 on the golden baseline routes.
export const ENERGY_COURSE_PUSH_COST_REFERENCE = 0.117;
export const ENERGY_COURSE_WEIGHT_MAX = 2;

const routeExposureCache = new WeakMap();

function getRouteMeanRebootExposure(tileMap, route, options) {
  const cached = routeExposureCache.get(route);
  if (cached) return cached;
  let total = 0;
  let squares = 0;
  for (const transition of route.transitions ?? []) {
    if (!transition?.to) continue;
    total += getRebootExposureSum(tileMap, transition.to, options);
    squares += 1;
  }
  const result = { total, squares };
  routeExposureCache.set(route, result);
  return result;
}

export function getEnergyCoursePushCostPerHit(meanExposure) {
  const push = ENERGY_COURSE_PUSH_COST;
  const later = push.averageLaterRegisters;
  const restOfTurnExposure = Math.max(0, Number(meanExposure) || 0) * push.restOfTurnSquares;
  const rebootChance = 1 - Math.exp(-(
    push.rebootHazard.base +
    push.rebootHazard.perLaterRegister * later +
    push.rebootHazard.perExposure * restOfTurnExposure
  ));
  return push.clogWeight + push.clogWeightPerLaterRegister * later + rebootChance * push.rebootClogLoad;
}

// Course disruption measured over start analyses that carry full-course traffic.
export function summarizeEnergyCourseWeight(tileMap, startAnalyses, options = {}) {
  let ranged = 0;
  let registers = 0;
  let exposure = 0;
  let squares = 0;
  let routes = 0;
  for (const analysis of startAnalyses ?? []) {
    const route = analysis?.fullCourseRoute;
    const shots = Number(analysis?.fullCourseTrafficRanged);
    if (!route?.transitions?.length || !Number.isFinite(shots)) continue;
    routes += 1;
    ranged += Math.max(0, shots);
    registers += route.transitions.length;
    if (tileMap) {
      const routeExposure = getRouteMeanRebootExposure(tileMap, route, options);
      exposure += routeExposure.total;
      squares += routeExposure.squares;
    }
  }
  const opponents = Math.max(1, (Number(options.playerCount) || routes || 2) - 1);
  if (!routes || !registers) {
    return { weight: 1, multiplier: 1, measured: false };
  }
  const shotsPerRegisterPerOpponent = ranged / getStandardRobotLaserCost() / registers / opponents;
  const meanExposure = squares ? exposure / squares : 0;
  const pushCost = shotsPerRegisterPerOpponent * getEnergyCoursePushCostPerHit(meanExposure);
  const weight = clamp(pushCost / ENERGY_COURSE_PUSH_COST_REFERENCE, 0, ENERGY_COURSE_WEIGHT_MAX);
  return {
    weight: Number(weight.toFixed(4)),
    multiplier: Number(getEnergyCourseMultiplier(weight).toFixed(4)),
    measured: true,
    shotsPerRegisterPerOpponent: Number(shotsPerRegisterPerOpponent.toFixed(4)),
    meanExposure: Number(meanExposure.toFixed(4)),
    pushCost: Number(pushCost.toFixed(4))
  };
}

// Linear between the simulated weights 0, 1 and 2.
export function getEnergyCourseMultiplier(weight) {
  const w = clamp(Number(weight), 0, ENERGY_COURSE_WEIGHT_MAX);
  if (!Number.isFinite(w)) return 1;
  const [m0, m1, m2] = ENERGY_VALUE_DISRUPTION_MULTIPLIERS;
  return w <= 1 ? m0 + (m1 - m0) * w : m1 + (m2 - m1) * (w - 1);
}
