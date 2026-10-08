// Robo Rally Course Randomizer - page state shared by several UI modules.
//
// Other modules read these bindings directly (imports are live) and change them
// only through the setters, because an imported binding cannot be reassigned
// outside the module that declares it. State used by a single UI topic lives in
// that topic's own module instead.

// The course currently shown.
export let currentScenario = null;
// When the scenario canvas last rendered (animation pacing).
export let lastScenarioRenderTime = 0;
// Generation session flags: a run in progress, a Stop request, and whether an
// acceptable course has been found yet (Stop then keeps the best so far).
export let isGenerating = false;
export let generationStopRequested = false;
export let generationHasRetainableCandidate = false;
// The "Highlight key spaces" map toggle.
export let mapFeatureHighlightEnabled = false;

export function setCurrentScenario(value) {
  currentScenario = value;
}

export function setLastScenarioRenderTime(value) {
  lastScenarioRenderTime = value;
}

export function setIsGenerating(value) {
  isGenerating = value;
}

export function setGenerationStopRequested(value) {
  generationStopRequested = value;
}

export function setGenerationHasRetainableCandidate(value) {
  generationHasRetainableCandidate = value;
}

export function setMapFeatureHighlightEnabled(value) {
  mapFeatureHighlightEnabled = value;
}
