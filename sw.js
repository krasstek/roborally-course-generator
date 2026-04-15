const APP_VERSION = "20260415185665";
const STATIC_CACHE = `roborally-static-${APP_VERSION}`;
const RUNTIME_CACHE = `roborally-runtime-${APP_VERSION}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  `./main.js?v=${APP_VERSION}`,
  `./render.js?v=${APP_VERSION}`,
  `./analyze.js?v=${APP_VERSION}`,
  `./board.js?v=${APP_VERSION}`,
  `./feature-weights.js?v=${APP_VERSION}`,
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-16.png",
  "./assets/icons/favicon-24.png",
  "./assets/icons/favicon-32.png",
  "./assets/icons/favicon.ico",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

const DATA_ASSETS = [
  "30th-docking-bay-a",
  "30th-docking-bay-b",
  "all-roads",
  "assembly",
  "black-gold",
  "blueprint",
  "cactus",
  "chasm",
  "circles",
  "circuit-trap",
  "coliseum",
  "coming-and-going",
  "concentric",
  "confusion",
  "convergence",
  "docking-bay-a",
  "docking-bay-b",
  "double-helix",
  "double-zap",
  "doubles",
  "energize",
  "falling",
  "fireball-factory",
  "flood-zone",
  "gauntlet-of-fire",
  "gear-box",
  "in-and-out",
  "labyrinth",
  "laser-maze",
  "links",
  "locked",
  "mb-docking-bay-a",
  "mb-docking-bay-b",
  "mb-tile-1a",
  "mb-tile-1b",
  "mb-tile-2a",
  "mb-tile-2b",
  "mb-tile-3a",
  "mb-tile-3b",
  "mb-tile-4a",
  "mb-tile-4b",
  "mb-tile-5a",
  "mb-tile-5b",
  "mb-tile-6a",
  "mb-tile-6b",
  "mb-tile-7a",
  "mb-tile-7b",
  "mb-tile-8a",
  "mb-tile-8b",
  "mb-tile-9a",
  "mb-tile-9b",
  "mb-tile-10a",
  "mb-tile-10b",
  "mb-tile-11a",
  "mb-tile-11b",
  "mb-tile-12a",
  "mb-tile-12b",
  "mb-tile-13a",
  "mb-tile-13b",
  "mb-tile-14a",
  "mb-tile-14b",
  "mb-tile-15a",
  "mb-tile-15b",
  "mb-tile-16a",
  "mb-tile-16b",
  "mb-tile-17a",
  "mb-tile-17b",
  "meeple",
  "mergers",
  "merry-go-round",
  "misdirection",
  "portal-palace",
  "pushy",
  "sampler",
  "sidewinder",
  "spin-class",
  "steps",
  "stop-and-go",
  "straight-a-ways",
  "styx",
  "tabula-rasa",
  "tempest",
  "the-abyss",
  "the-h",
  "the-keep",
  "the-o-ring",
  "the-oval",
  "the-pits",
  "the-wave",
  "the-x",
  "the-zone",
  "toasted",
  "transition",
  "trench-run",
  "vacancy",
  "water-park",
  "whirlpool",
  "winding"
].map((name) => `./data/${name}.json?v=${APP_VERSION}`);

const BOARD_IMAGES = [
  "all-roads.jpeg",
  "assembly.jpg",
  "black-gold.jpg",
  "blueprint.jpeg",
  "cactus.jpeg",
  "chasm.jpg",
  "circles.jpg",
  "circuit-trap.jpeg",
  "coliseum.jpg",
  "coming-and-going.jpeg",
  "concentric.JPG",
  "confusion.jpg",
  "convergence.jpg",
  "docking-bay-a.jpeg",
  "docking-bay-b.jpg",
  "double-helix.JPG",
  "double-zap.jpg",
  "doubles.jpg",
  "energize.jpeg",
  "falling.JPG",
  "fireball-factory.jpg",
  "flood-zone.jpg",
  "gauntlet-of-fire.jpeg",
  "gear-box.jpg",
  "in-and-out.jpeg",
  "labyrinth.jpg",
  "laser-maze.jpeg",
  "links.jpg",
  "locked.jpg",
  "mb-docking-bay-a.jpeg",
  "mb-docking-bay-b.jpeg",
  "meeple.jpg",
  "mergers.jpg",
  "merry-go-round.jpg",
  "misdirection.jpeg",
  "portal-palace.jpeg",
  "pushy.jpg",
  "sampler.JPG",
  "sidewinder.jpeg",
  "spin-class.jpg",
  "steps.jpeg",
  "stop-and-go.jpg",
  "straight-a-ways.JPG",
  "styx.jpg",
  "tabula-rasa.jpg",
  "tempest.jpeg",
  "the-abyss.jpg",
  "the-h.jpeg",
  "the-keep.jpeg",
  "the-o-ring.jpg",
  "the-oval.jpg",
  "the-pits.jpg",
  "the-wave.jpeg",
  "the-x.jpg",
  "the-zone.jpg",
  "toasted.jpg",
  "transition.jpg",
  "trench-run.jpg",
  "vacancy.JPG",
  "water-park.jpeg",
  "whirlpool.jpeg",
  "winding.jpeg"
].map((name) => `./assets/boards/${name}?v=${APP_VERSION}`);

const PRECACHE_URLS = [...CORE_ASSETS, ...DATA_ASSETS, ...BOARD_IMAGES];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name !== STATIC_CACHE && name !== RUNTIME_CACHE)
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request)) || cache.match("./index.html");
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || networkPromise || fetch(request);
}
