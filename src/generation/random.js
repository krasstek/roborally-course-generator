// Robo Rally Course Randomizer - generation randomness: seeded generator, sampling helpers and Dev View seed formatting
export let activeGenerationRandom = null;

export function createSeededGenerationRandom(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generationRandom() {
  return activeGenerationRandom ? activeGenerationRandom() : Math.random();
}

export async function withGenerationRandomSeed(seed, callback) {
  const previousRandom = activeGenerationRandom;
  activeGenerationRandom = Number.isInteger(seed)
    ? createSeededGenerationRandom(seed)
    : null;
  try {
    return await callback();
  } finally {
    activeGenerationRandom = previousRandom;
  }
}

export function createDevGenerationSeed() {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] >>> 0;
  }
  return ((Date.now() ^ Math.floor((typeof performance !== "undefined" ? performance.now() : 0) * 1000)) >>> 0);
}

export function formatDevGenerationSeed(seed) {
  return Number(seed >>> 0).toString(16).padStart(8, "0").toUpperCase();
}

export function parseDevGenerationSeed(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const hexText = text.replace(/^0x/i, "");
  if (/^[0-9a-fA-F]{1,8}$/.test(hexText)) {
    return Number.parseInt(hexText, 16) >>> 0;
  }

  if (/^[0-9]{1,10}$/.test(text)) {
    const decimal = Number(text);
    if (Number.isSafeInteger(decimal) && decimal >= 0 && decimal <= 0xFFFFFFFF) {
      return decimal >>> 0;
    }
  }

  return null;
}

export function sample(items) {
  return items[Math.floor(generationRandom() * items.length)];
}

export function shuffle(items) {
  const out = [...items];

  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(generationRandom() * (index + 1));
    [out[index], out[swapIndex]] = [out[swapIndex], out[index]];
  }

  return out;
}

export function sampleManyWeighted(items, count) {
  const pool = [...items];
  const out = [];

  while (pool.length && out.length < count) {
    const totalWeight = pool.reduce((sum, item) => sum + Math.max(0, item.weight ?? 1), 0);
    if (totalWeight <= 0) {
      break;
    }

    let roll = generationRandom() * totalWeight;
    let index = 0;

    for (; index < pool.length; index += 1) {
      roll -= Math.max(0, pool[index].weight ?? 1);
      if (roll <= 0) {
        break;
      }
    }

    out.push(pool.splice(Math.min(index, pool.length - 1), 1)[0]);
  }

  return out;
}
