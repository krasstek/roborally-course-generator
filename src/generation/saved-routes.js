// Robo Rally Course Randomizer - saved routes: the routed start field stored with a saved course
//
// A course's numbers come from its routed start field alone (route-field.js).
// Saving that field lets a reload evaluate the same routes without searching
// again (4-6x faster, and exact by construction). Stored as-is it is 0.7-4 MB, so
// the save keeps only what a reload reads and compresses it:
//
// - dropped: each start's copies of its first pool route (fullCourseRoute) and
//   of its first-leg routes (routes, selectedRoute), and the field's
//   expectedLegAnalyses. Normalization rebuilds the first from the pool; a
//   reload never reads the others (tested on 8 golden courses, 2026-11-25).
// - each leg of a route refers to its slice of the route's own registers
//   instead of repeating them, where the two are identical.
// - gzip (the browser's CompressionStream), base64 in the JSON save: about
//   120 KB for a 4-player course whose field is 4 MB.
//
// The field is tied to the analysis build (ANALYZE_BUILD_ID) and this format;
// a save from another build, or a browser without CompressionStream, simply
// has no usable field and the reload searches again, as before.
import { ANALYZE_BUILD_ID } from "../../analyze.js";

const SAVED_ROUTES_FORMAT = 1;
const DROPPED_START_FIELDS = new Set(["fullCourseRoute", "routes", "selectedRoute"]);

function compactRoute(route) {
  if (!route || !Array.isArray(route.transitions) || !Array.isArray(route.legRoutes)) return route;
  let offset = 0;
  const legRoutes = route.legRoutes.map((leg) => {
    const count = Array.isArray(leg?.transitions) ? leg.transitions.length : 0;
    const start = offset;
    offset += count;
    if (!count) return leg;
    const slice = route.transitions.slice(start, start + count);
    if (JSON.stringify(slice) !== JSON.stringify(leg.transitions)) return leg;
    const { transitions, ...rest } = leg;
    return { ...rest, savedTransitionSlice: [start, start + count] };
  });
  return { ...route, legRoutes };
}

function expandRoute(route) {
  if (!route || !Array.isArray(route.legRoutes)) return route;
  return {
    ...route,
    legRoutes: route.legRoutes.map((leg) => {
      if (!Array.isArray(leg?.savedTransitionSlice)) return leg;
      const { savedTransitionSlice: [start, end], ...rest } = leg;
      return { ...rest, transitions: structuredClone(route.transitions.slice(start, end)) };
    })
  };
}

export function compactRoutedField(firstLeg) {
  if (!Array.isArray(firstLeg?.starts)) return null;
  const { expectedLegAnalyses, ...rest } = firstLeg;
  return {
    ...rest,
    starts: firstLeg.starts.map((entry) => ({
      ...Object.fromEntries(Object.entries(entry).filter(([key]) => !DROPPED_START_FIELDS.has(key))),
      ...(Array.isArray(entry.fullCourseRoutes) ? { fullCourseRoutes: entry.fullCourseRoutes.map(compactRoute) } : {})
    }))
  };
}

export function expandRoutedField(compact) {
  if (!Array.isArray(compact?.starts)) return null;
  return {
    ...compact,
    starts: compact.starts.map((entry) => (
      Array.isArray(entry.fullCourseRoutes)
        ? { ...entry, fullCourseRoutes: entry.fullCourseRoutes.map(expandRoute) }
        : entry
    ))
  };
}

function hasCompression() {
  return typeof CompressionStream === "function" && typeof DecompressionStream === "function";
}

async function pipeBytes(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// The save's routedField, or null (no field, or no compression in this browser).
export async function encodeSavedRoutes(firstLeg) {
  const compact = compactRoutedField(firstLeg);
  if (!compact || !hasCompression()) return null;
  const json = new TextEncoder().encode(JSON.stringify(compact));
  const gzipped = await pipeBytes(json, new CompressionStream("gzip"));
  return {
    format: SAVED_ROUTES_FORMAT,
    build: ANALYZE_BUILD_ID,
    data: bytesToBase64(gzipped)
  };
}

// The routed field to evaluate a reload from, or null when the save has none
// usable (other build or format, no decompression, damaged data).
export async function decodeSavedRoutes(saved) {
  if (
    !saved ||
    saved.format !== SAVED_ROUTES_FORMAT ||
    saved.build !== ANALYZE_BUILD_ID ||
    typeof saved.data !== "string" ||
    !hasCompression()
  ) {
    return null;
  }
  try {
    const json = await pipeBytes(base64ToBytes(saved.data), new DecompressionStream("gzip"));
    return expandRoutedField(JSON.parse(new TextDecoder().decode(json)));
  } catch {
    return null;
  }
}
