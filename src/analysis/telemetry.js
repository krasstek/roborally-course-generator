// Robo Rally Course Randomizer - analysis telemetry
export function analysisTelemetryNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}
