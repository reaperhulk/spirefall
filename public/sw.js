// Spirefall offline worker. Strategy:
//  - navigations (index.html): network-first so new builds land immediately,
//    cache fallback so the game opens with no signal;
//  - everything else (hashed assets, icons): cache-first — Vite fingerprints
//    assets, so a cached hit is always the right bytes.
const CACHE = 'spirefall-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Old builds leave dead fingerprinted assets behind (the worker's bytes
// rarely change, so `activate` almost never refires — prune on successful
// navigations instead). Best-effort: Cache API iteration order is insertion
// order in practice, so trimming from the front drops the oldest builds.
async function pruneCache() {
  try {
    const cache = await caches.open(CACHE)
    const keys = await cache.keys()
    if (keys.length > 80) {
      for (const key of keys.slice(0, keys.length - 60)) await cache.delete(key)
    }
  } catch {
    // Pruning is hygiene, never worth failing a fetch over.
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          void pruneCache()
          return res
        })
        .catch(() => caches.match(req).then((hit) => hit ?? caches.match('./'))),
    )
    return
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
