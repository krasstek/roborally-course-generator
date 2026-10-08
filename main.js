// VERSION START: v49fp-safari-dev-panel-tightening
// Robo Rally Course Randomizer - production runtime
//
// Entry point: the page starts from src/ui/app.js. The calibration runner and
// the comparison harness import this file for the calibration API below.
import "./src/ui/app.js";

// Calibration API -----------------------------------------------------------
//
// The calibration harness deliberately reuses production construction and route
// semantics, but it is not a second generator. Internal calibration preferences
// only broaden sampling, force requested counts, preserve target misses as data,
// and expose cheap construction evidence. Browser generation never emits them.
// Missing calibration output therefore cannot affect correctness.

export {
  describeCalibrationInventory,
  generateCalibrationObservation,
  generateScenarioForTesting,
  hydrateScenarioForTesting,
  loadCalibrationAssets,
  reanalyzeCalibrationScenario,
  serializeScenarioForTesting
} from "./src/generation/calibration-hooks.js";
// VERSION END: v49fp-safari-dev-panel-tightening
