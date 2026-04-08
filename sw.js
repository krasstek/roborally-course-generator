const APP_VERSION = "20260408125247";
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
  "convergence",
  "docking-bay-a",
  "docking-bay-b",
  "doubles",
  "energize",
  "fireball-factory",
  "flood-zone",
  "gauntlet-of-fire",
  "gear-box",
  "in-and-out",
  "labyrinth",
  "laser-maze",
  "locked",
  "mb-docking-bay-a",
  "mb-docking-bay-b",
  "mergers",
  "misdirection",
  "portal-palace",
  "pushy",
  "sidewinder",
  "steps",
  "stop-and-go",
  "tabula-rasa",
  "tempest",
  "the-h",
  "the-keep",
  "the-o-ring",
  "the-oval",
  "the-wave",
  "the-x",
  "the-zone",
  "transition",
  "trench-run",
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
  "convergence.jpg",
  "docking-bay-a.jpeg",
  "docking-bay-b.jpg",
  "doubles.jpg",
  "energize.jpeg",
  "fireball-factory.jpg",
  "flood-zone.jpg",
  "gauntlet-of-fire.jpeg",
  "gear-box.jpg",
  "in-and-out.jpeg",
  "labyrinth.jpg",
  "laser-maze.jpeg",
  "locked.jpg",
  "mb-docking-bay-a.jpeg",
  "mb-docking-bay-b.jpeg",
  "mergers.jpg",
  "misdirection.jpeg",
  "portal-palace.jpeg",
  "pushy.jpg",
  "sidewinder.jpeg",
  "steps.jpeg",
  "stop-and-go.jpg",
  "tabula-rasa.jpg",
  "tempest.jpeg",
  "the-h.jpeg",
  "the-keep.jpeg",
  "the-o-ring.jpg",
  "the-oval.jpg",
  "the-wave.jpeg",
  "the-x.jpg",
  "the-zone.jpg",
  "transition.jpg",
  "trench-run.jpg",
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
