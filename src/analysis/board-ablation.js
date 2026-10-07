// Robo Rally Course Randomizer - fixed-route board ablation: what each board contributes to the chosen routes
import { tileKey } from "./board-geometry.js";
import { heuristic } from "./movement.js";
import {
  classifyTrafficOrientation,
  getClosestTimelineIndexByAbsoluteRegister,
  getDisplacementControlSeverity,
  getNearbyInteractionProbability,
  getRegisterTimeline,
  getRobotRangedPressure,
  getTemporalInteractionWeight
} from "./traffic.js";

export function getUniqueFixedRouteAblationRoutes(routes = []) {
  const seen = new Set();
  return (routes || []).filter((route) => {
    if (!route?.transitions?.length || seen.has(route)) return false;
    seen.add(route);
    return true;
  });
}

export function summarizeFixedRouteBoardAblation(
  originalTileMap,
  ablatedTileMap,
  routes = [],
  options = {}
) {
  const routeList = getUniqueFixedRouteAblationRoutes(routes);
  if (
    !(originalTileMap instanceof Map) ||
    !(ablatedTileMap instanceof Map) ||
    !routeList.length
  ) {
    return {
      model: "fixed-route-board-ablation-v49bz",
      observationalOnly: true,
      routeCount: routeList.length,
      originalTileCount: originalTileMap instanceof Map ? originalTileMap.size : 0,
      ablatedTileCount: ablatedTileMap instanceof Map ? ablatedTileMap.size : 0,
      removedTileCount: 0,
      routePositionMissingCount: 0,
      displacementChangedRegisterCount: 0,
      maxDisplacementControlSeverityAbsDelta: 0,
      weightedNearbyControlOriginal: 0,
      weightedNearbyControlAblated: 0,
      weightedNearbyControlAbsDelta: 0,
      weightedRobotLaserOriginal: 0,
      weightedRobotLaserAblated: 0,
      weightedRobotLaserAbsDelta: 0,
      modeledEffectDetected: false,
      coverage:
        "fixed-route displacement/control + robot-laser LOS; no rerouting"
    };
  }

  const removedTileCount = [...originalTileMap.keys()].filter(
    (key) => !ablatedTileMap.has(key)
  ).length;
  const timelines = routeList.map((route) => getRegisterTimeline(route));
  const originalControlProfiles = [];
  const ablatedControlProfiles = [];

  let routePositionMissingCount = 0;
  let displacementChangedRegisterCount = 0;
  let maxDisplacementControlSeverityAbsDelta = 0;

  timelines.forEach((timeline) => {
    const originalProfile = [];
    const ablatedProfile = [];
    timeline.forEach((point, timelineIndex) => {
      if (
        point?.after &&
        !ablatedTileMap.has(tileKey(point.after.x, point.after.y))
      ) {
        routePositionMissingCount += 1;
      }
      const originalSeverity = getDisplacementControlSeverity(
        originalTileMap,
        point?.after,
        timeline,
        timelineIndex,
        options
      );
      const ablatedSeverity = getDisplacementControlSeverity(
        ablatedTileMap,
        point?.after,
        timeline,
        timelineIndex,
        options
      );
      originalProfile.push(originalSeverity);
      ablatedProfile.push(ablatedSeverity);
      const delta = Math.abs(ablatedSeverity - originalSeverity);
      if (delta > 0.0005) {
        displacementChangedRegisterCount += 1;
        maxDisplacementControlSeverityAbsDelta = Math.max(
          maxDisplacementControlSeverityAbsDelta,
          delta
        );
      }
    });
    originalControlProfiles.push(originalProfile);
    ablatedControlProfiles.push(ablatedProfile);
  });

  let weightedNearbyControlOriginal = 0;
  let weightedNearbyControlAblated = 0;
  let weightedRobotLaserOriginal = 0;
  let weightedRobotLaserAblated = 0;
  let interactionPairCount = 0;

  for (let targetIndex = 0; targetIndex < routeList.length; targetIndex += 1) {
    const timelineA = timelines[targetIndex];
    if (!timelineA.length) continue;

    for (let otherIndex = 0; otherIndex < routeList.length; otherIndex += 1) {
      if (targetIndex === otherIndex) continue;
      const timelineB = timelines[otherIndex];
      if (!timelineB.length) continue;

      timelineA.forEach((pointA, timelineIndex) => {
        let temporalMass = 0;
        let strongestTemporal = 0;
        let nearbyOriginalWeighted = 0;
        let nearbyAblatedWeighted = 0;
        let laserOriginalWeighted = 0;
        let laserAblatedWeighted = 0;

        const maximumOtherUncertainty = 2.8;
        const temporalRadius = Math.ceil(
          ((pointA?.uncertainty ?? 1) + maximumOtherUncertainty) * 2.25
        );
        const centerIndex = getClosestTimelineIndexByAbsoluteRegister(
          timelineB,
          Number(pointA?.absoluteRegister) || (pointA?.legRegister ?? 1)
        );
        const firstIndex = Math.max(0, centerIndex - temporalRadius);
        const lastIndex = Math.min(
          timelineB.length - 1,
          centerIndex + temporalRadius
        );

        for (
          let pointBIndex = firstIndex;
          pointBIndex <= lastIndex;
          pointBIndex += 1
        ) {
          const pointB = timelineB[pointBIndex];
          const temporal = getTemporalInteractionWeight(pointA, pointB);
          if (temporal <= 0) continue;

          temporalMass += temporal;
          strongestTemporal = Math.max(strongestTemporal, temporal);

          const distance = heuristic(pointA.after, pointB.after);
          const orientation = classifyTrafficOrientation(pointA, pointB);
          const interactionProbability = getNearbyInteractionProbability(
            orientation,
            distance
          );
          nearbyOriginalWeighted += (
            interactionProbability *
            (originalControlProfiles[targetIndex][timelineIndex] ?? 1) *
            temporal
          );
          nearbyAblatedWeighted += (
            interactionProbability *
            (ablatedControlProfiles[targetIndex][timelineIndex] ?? 1) *
            temporal
          );

          laserOriginalWeighted += (
            getRobotRangedPressure(
              originalTileMap,
              pointA,
              pointB,
              options
            ) * temporal
          );
          laserAblatedWeighted += (
            getRobotRangedPressure(
              ablatedTileMap,
              pointA,
              pointB,
              options
            ) * temporal
          );
        }

        if (temporalMass <= 0) return;
        interactionPairCount += 1;
        const credibility = Math.min(1, strongestTemporal);
        weightedNearbyControlOriginal += (
          nearbyOriginalWeighted / temporalMass
        ) * credibility;
        weightedNearbyControlAblated += (
          nearbyAblatedWeighted / temporalMass
        ) * credibility;
        weightedRobotLaserOriginal += (
          laserOriginalWeighted / temporalMass
        ) * credibility;
        weightedRobotLaserAblated += (
          laserAblatedWeighted / temporalMass
        ) * credibility;
      });
    }
  }

  const nearbyAbsDelta = Math.abs(
    weightedNearbyControlAblated - weightedNearbyControlOriginal
  );
  const laserAbsDelta = Math.abs(
    weightedRobotLaserAblated - weightedRobotLaserOriginal
  );
  const modeledEffectDetected = (
    routePositionMissingCount > 0 ||
    displacementChangedRegisterCount > 0 ||
    nearbyAbsDelta > 0.0005 ||
    laserAbsDelta > 0.0005
  );

  return {
    model: "fixed-route-board-ablation-v49bz",
    observationalOnly: true,
    routeCount: routeList.length,
    originalTileCount: originalTileMap.size,
    ablatedTileCount: ablatedTileMap.size,
    removedTileCount,
    routePositionMissingCount,
    displacementChangedRegisterCount,
    maxDisplacementControlSeverityAbsDelta: Number(
      maxDisplacementControlSeverityAbsDelta.toFixed(4)
    ),
    interactionPairCount,
    weightedNearbyControlOriginal: Number(
      weightedNearbyControlOriginal.toFixed(4)
    ),
    weightedNearbyControlAblated: Number(
      weightedNearbyControlAblated.toFixed(4)
    ),
    weightedNearbyControlAbsDelta: Number(nearbyAbsDelta.toFixed(4)),
    weightedRobotLaserOriginal: Number(
      weightedRobotLaserOriginal.toFixed(4)
    ),
    weightedRobotLaserAblated: Number(
      weightedRobotLaserAblated.toFixed(4)
    ),
    weightedRobotLaserAbsDelta: Number(laserAbsDelta.toFixed(4)),
    modeledEffectDetected,
    coverage:
      "fixed-route one-square displacement/control (including destination conveyor/water/hazard/edge consequences) + robot-laser LOS; no rerouting; no generic proximity credit"
  };
}
