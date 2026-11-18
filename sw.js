// App shell is cached. Training CSVs are always network-first so a new
// commit shows up without a code change. A cached copy is only a fallback.

const VERSION = "td-1";
const SHELL = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./js/csv.js",
  "./js/metrics.js",
  "./js/charts.js",
  "./manifest.json",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/favicon-32.png",
];
const DATA = ["./data/runs.csv", "./data/strength.csv"];

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isData(url)) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigate(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

function isData(url) {
  return url.pathname.endsWith(".csv") || url.pathname.includes("/data/");
}

async function precache() {
  const cache = await caches.open(VERSION);
  await Promise.all([...SHELL, ...DATA].map(async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Missing ${url}`);
    await store(cache, url, response);
  }));
}

async function store(cache, request, response) {
  const headers = new Headers(response.headers);
  const clean = new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  await cache.put(request, clean);
}

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const fresh = await fetch(request, { cache: "no-store" });
    if (fresh && fresh.ok) {
      await store(cache, request, fresh.clone());
      return fresh;
    }
    return (await cache.match(request, { ignoreSearch: true })) || fresh;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function networkFirstNavigate(request) {
  const cache = await caches.open(VERSION);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) await store(cache, request, fresh.clone());
    return fresh;
  } catch (error) {
    return (await cache.match("./index.html"))
      || (await cache.match("./"))
      || (await cache.match(request))
      || Promise.reject(error);
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) await store(cache, request, fresh.clone());
  return fresh;
}
