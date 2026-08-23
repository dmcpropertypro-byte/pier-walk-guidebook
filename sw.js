/* Pier Walk Guest Guidebook — service worker
 *
 * STRATEGY: ONLINE-FIRST (Marco's directive). The live site is ALWAYS the source
 * of truth. The cache is a pure emergency fallback for a genuine loss of
 * connectivity — never a performance shortcut that could serve a guest a stale
 * code, policy, or checkout instruction while they're online.
 *
 *   - API calls (Render backend: chat, quotes, subscribe) -> NETWORK ONLY.
 *     Never cached, never replayed. A stale AI answer or quote is worse than an
 *     honest error, and the chat needs a live connection by definition.
 *   - Everything else (HTML, images, icons) -> NETWORK FIRST, cache fallback.
 *     A successful fetch refreshes the cache. If the network fails OR stalls
 *     past NET_TIMEOUT_MS (dead-air WiFi is as offline as no WiFi), we serve the
 *     last good copy so the guidebook still opens at the beach.
 */

const CACHE = "pierwalk-guidebook-v1";
const NET_TIMEOUT_MS = 4000;

// Minimal precache: enough that a cold offline launch still renders.
const PRECACHE = [
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// Hosts whose responses must NEVER be cached or served from cache.
const NEVER_CACHE = ["pier-walk-agent-stack.onrender.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isApi(url) {
  return NEVER_CACHE.some((h) => url.hostname.indexOf(h) !== -1);
}

/** Race the network against a timeout — a stalled connection counts as offline. */
function fetchWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("network-timeout")), NET_TIMEOUT_MS);
    fetch(request).then(
      (resp) => { clearTimeout(timer); resolve(resp); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;                 // never touch POSTs (chat, subscribe)

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Backend API: straight to the network, no cache involvement at all.
  if (isApi(url)) return;

  event.respondWith(
    fetchWithTimeout(req)
      .then((resp) => {
        // Refresh the fallback copy on every successful same-origin fetch.
        if (resp && resp.ok && url.origin === self.location.origin) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return resp;
      })
      .catch(() =>
        // Genuine offline (or dead-air) — serve the last good copy.
        caches.match(req).then((hit) =>
          hit || caches.match("./index.html").then((idx) =>
            idx || new Response(
              "<h1>You're offline</h1><p>Reconnect to load your Pier Walk guidebook.</p>",
              { headers: { "Content-Type": "text/html" }, status: 503 }
            )
          )
        )
      )
  );
});
