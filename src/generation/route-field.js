// Robo Rally Course Randomizer - the routed start field as input to a course's final evaluation
//
// A finished course is evaluated from its routed start field: every start's pool
// of complete-course routes. Generation and a page reload must reach the same
// numbers from the same field, so the evaluation may depend on the routes only,
// never on the passes that produced them. Two things here make that hold:
//
// - normalizeRoutedFirstLeg() rebuilds each start from its route pool alone. It
//   works on copies (route objects carry identity-keyed analysis caches from
//   earlier passes), drops the per-route fairness RE cached under earlier
//   options, starts every start from the head of its pool, and recomputes
//   selection, traffic and scores once over the whole field.
// - replayStartEnergyRescues() repeats the accepted Pay to Win / Subsidized
//   Starts energy-rescue searches recorded with the course, so a reload's pools
//   contain the same extra routes generation found.
import { analyzeFullCourse, recomputeFirstLegPressure } from "../../analyze.js";
import { NORMAL_FULL_COURSE_TRAFFIC_PASSES } from "./config.js";
import {
  buildEconomyTargetedRescueSearchOptions,
  mergeEconomyTargetedRescueRoutesIntoField
} from "./start-pricing.js";
import { getRouteAnalysisVariantOptions } from "./variant-availability.js";

const CACHED_ROUTE_FAIRNESS_FIELDS = [
  "normalFairnessIntrinsicRE",
  "normalFairnessIntrinsicREModel",
  "normalFairnessIntrinsicREComponents"
];

function withoutCachedRouteFairness(route) {
  const copy = { ...route };
  for (const field of CACHED_ROUTE_FAIRNESS_FIELDS) delete copy[field];
  return copy;
}

export function normalizeRoutedFirstLeg(tileMap, firstLeg, playerCount, options = {}) {
  if (!firstLeg?.starts) return firstLeg;
  const starts = structuredClone(firstLeg.starts).map((entry) => {
    const pool = (entry.fullCourseRoutes ?? []).map(withoutCachedRouteFairness);
    if (!pool.length) return entry;
    const head = pool[0];
    return {
      ...entry,
      fullCourseRoutes: pool,
      fullCourseRoute: head,
      fullCourseRouteIndex: 0,
      balanceScore: Number.isFinite(head.score) ? Number(head.score.toFixed(2)) : Infinity
    };
  });
  return recomputeFirstLegPressure(tileMap, { ...firstLeg, starts }, {
    ...getRouteAnalysisVariantOptions(options),
    playerCount,
    excludedIndices: [],
    openingTrafficOnly: false,
    balanceTrafficScope: "full",
    trafficOccupancyUseBalanceScore: true,
    carryOccupancyScores: true,
    fullCourseTrafficPasses: options.fullCourseTrafficPasses ?? NORMAL_FULL_COURSE_TRAFFIC_PASSES,
    skipTraffic: Boolean(options.skipTraffic)
  });
}

// The accepted rescues as recorded in the course's Pay to Win pricing summary,
// in the order generation accepted them.
export function getAcceptedStartEnergyRescues(payToWinPricing) {
  const details = payToWinPricing?.targetedEnergyRescue?.details;
  if (!Array.isArray(details)) return [];
  return details
    .filter((detail) => detail?.accepted && Number.isInteger(detail.index) && Number.isFinite(detail.startingEnergy))
    .map((detail) => ({ index: detail.index, startingEnergy: detail.startingEnergy }));
}

export function replayStartEnergyRescues(tileMap, firstLeg, rescues, pricingOptions) {
  let field = firstLeg;
  for (const { index, startingEnergy } of rescues) {
    const target = field.starts.find((analysis) => analysis.index === index);
    if (!target?.start || !Array.isArray(field.flags) || !field.flags.length) continue;
    const rescueAnalysis = analyzeFullCourse(
      tileMap,
      [{ ...target.start, analysisIndex: index }],
      field.flags,
      buildEconomyTargetedRescueSearchOptions(field, pricingOptions, startingEnergy)
    );
    const rescueTarget = rescueAnalysis?.starts?.find((analysis) => analysis.index === index)
      ?? rescueAnalysis?.starts?.[0]
      ?? null;
    const rescueRoutes = rescueTarget?.fullCourseRoutes?.length
      ? rescueTarget.fullCourseRoutes.filter(Boolean)
      : (rescueTarget?.fullCourseRoute ? [rescueTarget.fullCourseRoute] : []);
    field = mergeEconomyTargetedRescueRoutesIntoField(
      field,
      index,
      rescueRoutes,
      tileMap,
      pricingOptions,
      startingEnergy
    ).field;
  }
  return field;
}
