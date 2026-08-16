// Service Worker — step-tracker
// Caching policy mirrors src/sw-policy.js — keep in sync.
// Classic worker (no ES imports) for iOS Safari compatibility.

const SW_VERSION = 'step-tracker-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SW_VERSION).then((cache) =>
      cache.addAll(['/', '/index.html', '/styles.css', '/manifest.json'])
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(cacheNames.filter((name) => name !== SW_VERSION).map((name) => caches.delete(name)))
    )
  );
});

// Mirrored decision table — mirrors src/sw-policy.js — keep in sync.
function classifyRequestUrl(urlString, origin) {
  if (typeof urlString !== 'string' || urlString.trim() === '') {
    return 'SKIP';
  }
  if (typeof origin !== 'string') {
    return 'SKIP';
  }

  let url;
  try {
    url = new URL(urlString);
  } catch {
    return 'SKIP';
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return 'SKIP';
  }

  const host = url.hostname;
  const path = url.pathname;

  if (host === 'googleapis.com' || host.endsWith('.googleapis.com')) {
    if (path.startsWith('/fitness/') || path.startsWith('/drive/')) {
      return 'NETWORK_ONLY';
    }
  }

  if (host === 'accounts.google.com' && path.includes('/gsi/')) {
    return 'STALE_WHILE_REVALIDATE';
  }

  if (url.origin === origin) {
    return 'CACHE_FIRST';
  }

  return 'SKIP';
}

self.addEventListener('fetch', (event) => {
  event.respondWith(handleFetch(event.request));
});

async function handleFetch(request) {
  try {
    const policy = classifyRequestUrl(request.url, self.location.origin);

    if (policy === 'NETWORK_ONLY') {
      return fetch(request);
    }

    const cache = await caches.open(SW_VERSION);

    if (policy === 'STALE_WHILE_REVALIDATE') {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }

    if (policy === 'CACHE_FIRST') {
      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }
      const response = await fetch(request);
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    }

    return fetch(request);
  } catch {
    return fetch(request);
  }
}