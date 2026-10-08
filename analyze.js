// VERSION START: v49fo-randomizer-hotpath-fix
// Robo Rally Course Randomizer - route analysis and scoring runtime
//
// Public entry point of the route analysis. The implementation lives in
// src/analysis/ (one module per topic, low layers first); this file only
// re-exports the analysis API used by main.js, the scripts and tools.

export const ANALYZE_BUILD_ID = "v49fo-randomizer-hotpath-fix";

// This module is a route-evaluation model for board setup, not a full RoboRally
// simulator. It resolves movement-shaping effects that materially change route
// topology and replays the board hazards that feed authoritative RE/damage
// ownership on their actual register chronology; cheap search may still use
// bounded guidance penalties for discovery.
//
// Current design invariants:
// - Every route exposed to Dev View must remain physically/register/facing exact
//   and reconstruct to a literally playable five-register program sequence.
// - Energy/upgrades remain part of route quality whenever they are in play;
//   Energy Crisis (lighterGame) is currently the only rule that removes them.
// - Programming-card legality uses only the consequential rolling window: the
//   previous five-register program plus the current one. Search carries literal
//   card-use counts for those two programs and the immediately previous executed
//   action solely so Again can repeat it; no older program history is search state.
// - Uncertainty may reduce route breadth, but it never coarsens card legality.
// - Hazards are intrinsic route costs. Traffic remains a later relational layer:
//   it never alters intrinsic legality, but confidence-weighted traffic may request
//   additional leg witnesses after the first exact route set is complete.
// - v49ej ownership invariant: completed evaluation should use RE/mechanistic
//   owners wherever a credible estimate exists. Legacy score-space/feature weights
//   may guide cheap discovery, construction, compatibility or diagnostics, but
//   should be pruned from authoritative evaluation as matching RE owners land.
// - Dynamic Archiving carries the current archive marker as per-robot exact route
//   state. It affects pit/edge/autokill consequence, exact dominance, repairs and
//   leg handoff; cheap physical discovery deliberately uses a leg-local recovery
//   proxy so archive history does not explode the estimate state/cache space.
// - Normal primary routing is estimate-first, realize-second. Every structural
//   start receives a complete physical full-course estimate, one cached leg at a
//   time, before the player-count acceptance floor is consulted. Estimated card
//   demand is soft preference only and cannot make a physical route unreachable.
// - Each complete estimate is then realized against the exact rolling two-program
//   card model. The first impossible register triggers a physical suffix replan
//   from that exact board/register/history point; a bounded estimate miss widens
//   to physical-graph exhaustion instead of becoming a hidden capacity failure.
// - Traffic uses one common start-quality scale for the whole currently
//   available field. Player-count occupancy mass is diluted across surplus starts
//   by those fixed relative qualities, then focus/known selections condition that
//   common field without recomputing the quality temperature. Route convergence
//   naturally recombines fractional occupancy later. Future traffic is then
//   attenuated continuously as elapsed registers, hazards and prior predicted
//   interactions make distant multiplayer positions less credible. Alternatives
//   are demand-led.
// - Energy is soft guidance during physical estimation and is replayed/repriced on
//   the exact realized route; it is never a physical dominance dimension.

export { getCompletedRouteExpansions } from "./src/analysis/telemetry.js";
export { getProgramCardVariantModelSummary } from "./src/analysis/program-availability.js";
export { simulateAction } from "./src/analysis/movement.js";
export {
  ROUTE_ENERGY_ECONOMY_DEFAULTS,
  estimateInitialUpgradeOpportunitiesRemaining,
  evaluateRouteUpgradePotential,
  getCourseMaxEnergy,
  getCourseStartingEnergy,
  getCourseStartingUpgradeCards,
  getRouteEnergyEconomyConfig,
  getRouteEnergyGainUtility,
  getRouteMarginalEnergyUtility,
  getRouteUpgradePotential
} from "./src/analysis/energy-economy.js";
export {
  DAMAGE_ECONOMY_MODEL_ID,
  getDamageEconomyTelemetrySnapshot
} from "./src/analysis/damage-economy.js";
export { summarizePowerUpOpportunityBenchmark } from "./src/analysis/route-search.js";
export {
  TRAFFIC_OWNERSHIP_AUDIT_ID,
  buildStartOccupancyMap,
  summarizeIntrinsicRouteForecastConfidence,
  summarizeTrafficOwnershipAudit
} from "./src/analysis/traffic.js";
export {
  RE_LEDGER_MODEL_ID,
  getObservationalMentalRegisterEquivalents
} from "./src/analysis/re-ledger.js";
export {
  summarizeDamageEconomyFoundationForRoute,
  summarizeRENativeRouteUncertaintyEvidence,
  summarizeRegisterEquivalentLedger
} from "./src/analysis/route-evaluation.js";
export {
  rescoreFixedRouteUpgradeEconomy,
  summarizeFixedRouteUpgradeEconomyActivity
} from "./src/analysis/route-pricing-economy.js";
export {
  PATHFINDER_OBJECTIVE_AUDIT_ID,
  summarizeCheapSearchRegisterEquivalentShadow,
  summarizePathfinderObjectiveAudit,
  summarizePowerUpProgramFeasibility
} from "./src/analysis/re-diagnostics.js";
export { analyzeGoalApproaches, scoreFlagArea } from "./src/analysis/flag-area.js";
export { summarizeFixedRouteBoardAblation } from "./src/analysis/board-ablation.js";
export { NORMAL_FAIRNESS_RE_MODEL_ID } from "./src/analysis/route-selection.js";
export {
  summarizeProgramSequencePressure,
  summarizeTargetedSameRegisterCardPressureSearch
} from "./src/analysis/contextual-search.js";
export { analyzeCourse } from "./src/analysis/course-analysis.js";
export {
  analyzeFlagLeg,
  analyzeFullCourse,
  analyzeFullCourseCooperative,
  evaluateFullCourseFocusPaymentCurveUnderOccupancy,
  recomputeFirstLegPressure
} from "./src/analysis/full-course.js";
export {
  clearAnalysisCaches,
  getAnalysisTelemetrySnapshot,
  resetAnalysisTelemetry
} from "./src/analysis/analysis-state.js";
