// Robo Rally Course Randomizer - what generation may ask of its host page.
//
// Generation code never reads the page itself. The few questions it needs
// answered (Dev View switches and the currently offered difficulty/length
// options) go through this module. The defaults are the headless answers used by
// the comparison harness and calibration; the browser page registers its own
// implementations at start-up (see src/ui/app.js), which read the controls exactly as
// before.
import { DIAGNOSTIC_DIFFICULTIES, DIAGNOSTIC_LENGTHS } from "./config.js";

const providers = {
  isDevViewEnabled: () => false,
  isDevRouteModelOverrideActive: () => false,
  isDevFastTrafficEnabled: () => false,
  isDevFastAlternatesEnabled: () => false,
  // Headless runs have no controls; use the full option set a fresh page offers,
  // so "Any" resolves exactly as it would there.
  getAvailableConcretePreferenceValues: (selectId) => {
    if (selectId === "difficulty") return [...DIAGNOSTIC_DIFFICULTIES];
    if (selectId === "length") return [...DIAGNOSTIC_LENGTHS];
    return [];
  }
};

export function registerGenerationEnvironment(overrides = {}) {
  Object.assign(providers, overrides);
}

export function isDevViewEnabled() {
  return providers.isDevViewEnabled();
}

export function isDevRouteModelOverrideActive() {
  return providers.isDevRouteModelOverrideActive();
}

export function isDevFastTrafficEnabled() {
  return providers.isDevFastTrafficEnabled();
}

export function isDevFastAlternatesEnabled() {
  return providers.isDevFastAlternatesEnabled();
}

export function getAvailableConcretePreferenceValues(selectId) {
  return providers.getAvailableConcretePreferenceValues(selectId);
}
