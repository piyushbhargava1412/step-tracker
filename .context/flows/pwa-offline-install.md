# Flow: PWA Install & Offline App Shell Caching

> Added: ST-013 — 2026-08-16

<!-- context-meta
verification-commit: HEAD
generated-at: 2026-08-16T11:48:29Z
confidence: medium
-->

## Overview
Makes the app an installable Progressive Web App and gives the app shell offline availability. A
checked-in web app manifest (`public/manifest.json`) plus two 192/512 PNG icons make the app
installable from iOS Safari, Android Chrome, and desktop Chrome/Edge. A hand-written classic
service worker (`public/sw.js`) precaches the app shell at install and, on `fetch`, applies a
per-request caching policy (`CACHE_FIRST` for same-origin assets, `NETWORK_ONLY` for Google
Fit/Drive REST calls, `STALE_WHILE_REVALIDATE` for the GSI bootstrap script, `SKIP`/pass-through
for everything else). The policy decision table is authored once as a pure module
(`src/sw-policy.js`) and hand-mirrored into the classic-worker `public/sw.js` (which cannot use ES
imports for iOS Safari compatibility); a dedicated parity test (`src/pwa-sanity.test.js`) extracts
the embedded `classifyRequestUrl` function from `public/sw.js` source and asserts it returns
identical results to `src/sw-policy.js` across a shared URL table, guarding against the two copies
drifting apart. Registration is wired into `src/main.js` bootstrap as a fire-and-forget, PROD-gated,
fail-open call so the dev server never registers a service worker over Vite HMR assets. A GitHub
Actions workflow (`.github/workflows/deploy.yml`) deploys every push to `main` to Cloudflare Pages,
test-gated (`npm ci` → `npm test` → `npm run build` → Pages deploy).

## Entry Points
- **Type**: App lifecycle (browser) — `DOMContentLoaded` → `bootstrap()` (`src/main.js`) calls
  `createSwRegister({ nav: navigator, config: { prod: import.meta.env.PROD } }).register()`,
  fire-and-forget (not awaited), fail-open (`.catch()` + inner `try/catch`, both logging via
  `console.error('[main] SW registration failed, continuing', err)`)
- **Type**: Browser Service Worker lifecycle — `install` (precache app shell), `activate` (delete
  stale-version caches), `fetch` (policy-routed response) events on `public/sw.js`, registered
  against scope `/`
- **Type**: CI/CD — GitHub Actions `push` to `main` → `.github/workflows/deploy.yml` → Cloudflare
  Pages deploy of `dist/`
- **File**: `src/sw-register.js` (registration factory), `public/sw.js` (service worker), `src/sw-policy.js`
  (pure caching-policy classifier, mirrored into `public/sw.js`), `public/manifest.json` (web app
  manifest), `public/icons/icon-192.png`, `public/icons/icon-512.png`, `index.html` (`<link
  rel="manifest">` + `<meta name="theme-color">`), `.github/workflows/deploy.yml`

## Core Path

### Manifest & install (`public/manifest.json`, `index.html`)
1. `index.html` `<head>` links `<link rel="manifest" href="/manifest.json" />` and sets
   `<meta name="theme-color" content="#0ea5e9" />` (exactly one of each).
2. `public/manifest.json` declares `name: "step-tracker"`, `short_name: "Step Tracker"`,
   `display: "standalone"`, `start_url: "/"`, `scope: "/"`, `background_color: "#020617"`,
   `theme_color: "#0ea5e9"`, and two icons (`/icons/icon-192.png` 192x192, `/icons/icon-512.png`
   512x512, both `image/png`, `purpose: "any"` on the 512 icon) — enabling the native install
   prompt/menu entry on supporting browsers.

### Registration (`src/sw-register.js`, wired from `src/main.js`)
3. `createSwRegister({ nav, config, log })` returns `{ register() }`. `register()` is a no-op that
   resolves immediately when `config.prod` is falsy (dev-server guard) or when
   `nav?.serviceWorker?.register` is not callable; otherwise it awaits
   `nav.serviceWorker.register('/sw.js')`, catching and logging (never rethrowing) any rejection.
4. `src/main.js`'s `bootstrap()` calls this **without awaiting** — SW install/registration never
   blocks first render — wrapped in its own try/catch as a second fail-open layer.

### Caching policy (`src/sw-policy.js`, mirrored in `public/sw.js`)
5. `classifyRequestUrl(urlString, origin)` is a pure classifier (no `navigator`/`document`/`caches`/
   `fetch` references) returning one of four buckets:
   - `NETWORK_ONLY` — `googleapis.com` (or `*.googleapis.com`) hosts with a `/fitness/` or `/drive/`
     path prefix (Google Fit + Drive REST calls; tokens/sync data must never be served from cache).
   - `STALE_WHILE_REVALIDATE` — `accounts.google.com` paths containing `/gsi/` (the GSI bootstrap
     script).
   - `CACHE_FIRST` — any same-origin request (`url.origin === origin`).
   - `SKIP` — everything else (cross-origin fonts/third-party assets, non-http(s) schemes, malformed
     URLs, non-string input) — passed straight through with no cache interaction.
6. `public/sw.js` hand-mirrors this exact decision table inline (classic worker, no ES module
   imports, for iOS Safari compatibility) under a `// mirrors src/sw-policy.js — keep in sync`
   comment.

### Service worker lifecycle (`public/sw.js`)
7. `install` — `caches.open(SW_VERSION)` then `cache.addAll(['/', '/index.html', '/styles.css',
   '/manifest.json'])`; only stable root files are precached — hashed build asset filenames
   (Vite's `dist/assets/*`) are never hardcoded and populate the cache lazily on first fetch instead
   (avoids the precache list going stale across builds).
8. `activate` — deletes any cache whose name is not the current `SW_VERSION`, dropping prior
   versions.
9. `fetch` — `handleFetch(request)` classifies the request via the mirrored
   `classifyRequestUrl(request.url, self.location.origin)`, then:
   - `NETWORK_ONLY` → `fetch(request)` directly, no cache read/write.
   - `STALE_WHILE_REVALIDATE` → returns the cached response immediately if present while a
     background `fetch` updates the cache (`response.ok || response.type === 'opaque'` — opaque
     no-cors GSI responses are cached too); falls back to the network promise if nothing was cached.
   - `CACHE_FIRST` **and** `request.mode === 'navigate'` (HTML navigations) → **network-first**:
     fetch first and cache a successful response, only falling back to the cache on network failure.
     This is deliberate: `SW_VERSION` is a manually-bumped string (no auto-`skipWaiting`), so
     serving navigations cache-first would pin returning users to a stale HTML shell + old hashed
     bundle references indefinitely.
   - `CACHE_FIRST` (non-navigation, e.g. `styles.css`, hashed JS bundles) → serve from cache if
     present, else fetch-and-populate.
   - `SKIP` (or any unmatched case) → plain `fetch(request)`, no cache interaction.
   - The whole handler is wrapped in `try/catch`, falling back to a plain `fetch(request)` on any
     internal error (fail-open — a caching bug never breaks a request).
10. No `self.skipWaiting()` / `clients.claim()` call anywhere — updates are **update-on-next-visit**:
    a new SW version installs and activates in the background but a hard refresh/tab reopen is
    needed to hand control to it (documented in README's "Service Worker Updates" section).

### Deploy pipeline (`.github/workflows/deploy.yml`)
11. On every push to `main`: `actions/checkout` → `actions/setup-node@v4` (Node 20, npm cache) →
    `npm ci` → `npm test` (full Vitest suite — deploy is test-gated) → `npm run build` with
    `VITE_CLIENT_ID` injected from the `GOOGLE_CLIENT_ID` repo secret → `cloudflare/wrangler-action@v3`
    deploys `dist/` to the Cloudflare Pages project `step-tracker` using `CLOUDFLARE_API_TOKEN` /
    `CLOUDFLARE_ACCOUNT_ID` secrets. `permissions: contents: read` (minimal). The Pages project
    itself is a one-time manual/CLI setup — the workflow only deploys to an existing project.

## Data Touchpoints
- **Entities**: None (no Dexie/IndexedDB reads or writes in this flow).
- **Tables**: None.
- **UI Surface**: `index.html` `<head>` (manifest link, theme-color meta); browser-native install
  UI (address-bar install icon, OS "Add to Home Screen" sheet) — not app-rendered DOM.
- **Browser API**: `navigator.serviceWorker.register()`, the Cache Storage API
  (`caches.open`/`match`/`put`/`keys`/`delete`) inside `public/sw.js`, the Fetch/`respondWith`
  interception API.
- **Filesystem (build output)**: `public/manifest.json`, `public/icons/icon-192.png`,
  `public/icons/icon-512.png`, `public/sw.js` are served as static top-level files by Vite (the
  `public/` directory is copied to `dist/` root unmodified).

## Integrations
- **Type**: Browser API
- **Target**: `navigator.serviceWorker` (registration), Cache Storage API (`caches.*`)
- **Channel**: N/A (in-browser only, no network call initiated by this flow itself — the SW instead
  intercepts/proxies requests other flows make)
- **Type**: CI/CD external service
- **Target**: Cloudflare Pages (via `cloudflare/wrangler-action@v3`)
- **Channel**: HTTPS, authenticated via `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` GitHub secrets

## Error / Retry Surface
- `createSwRegister().register()` never throws or rejects to its caller: a missing/PROD-false
  guard short-circuits to a resolved no-op; a rejected `nav.serviceWorker.register()` call is
  caught and passed to the injected `log` function (defaults to `console.error`).
- `src/main.js`'s bootstrap call site double-guards with both a `.catch()` on the returned promise
  and an outer `try/catch` around the synchronous `createSwRegister(...)` call itself, each logging
  `[main] SW registration failed, continuing`.
- `public/sw.js`'s `fetch` handler wraps its entire policy-dispatch body in `try/catch`, falling
  back to an unmodified `fetch(request)` on any internal failure — a caching bug degrades to normal
  network behavior rather than breaking the request.
- The deploy workflow is test-gated (`npm test` runs before `npm run build`/deploy); a failing test
  suite stops the deploy before Cloudflare Pages is touched.

## Scope
- `src/sw-policy.js` — pure classifier: `classifyRequestUrl(urlString, origin)`; exports
  `CACHE_FIRST`, `STALE_WHILE_REVALIDATE`, `NETWORK_ONLY`, `SKIP`
- `src/sw-register.js` — `createSwRegister({ nav, config, log })` → `{ register() }`; PROD-gated,
  fail-open registration factory
- `public/sw.js` — classic (non-module) service worker; hand-mirrors `src/sw-policy.js`'s decision
  table; owns install/activate/fetch lifecycle and the network-first-navigation + SWR-opaque-response
  caching rules
- `public/manifest.json` — web app manifest (name/short_name/display/start_url/scope/colors/icons)
- `public/icons/icon-192.png`, `public/icons/icon-512.png` — checked-in PNG icons referenced by the
  manifest
- `index.html` — `<link rel="manifest">`, `<meta name="theme-color">`
- `src/main.js` — bootstrap wiring: fire-and-forget, fail-open `createSwRegister(...).register()` call
- `.github/workflows/deploy.yml` — GitHub Actions test-gated Cloudflare Pages deploy on push to `main`
- `README.md` — "Deploying to Cloudflare Pages", "Install as a PWA", "Offline Usage", "Service Worker
  Updates" sections

## Tests
- `src/sw-policy.test.js` — `classifyRequestUrl` happy path (all four buckets), edge cases (path
  prefix false-positives, case-insensitive host, cross-origin-port SKIP), guard clauses (non-http(s)
  schemes, empty/non-string/malformed input), module-shape assertion (no `navigator`/`document`/
  `caches`/`fetch` references — pure classifier contract).
- `src/sw-register.test.js` — registers exactly once with `'/sw.js'` when `config.prod` is true;
  no-op when `prod` is false or `nav.serviceWorker` is absent/non-callable; catches and logs a
  rejected `register()` call without rethrowing; module-shape assertion (no bare `navigator`
  reference — only the injected `nav`).
- `src/manifest.test.js` — manifest identity/display/colors/icon-entry assertions; resolves every
  icon `src` to an on-disk file; verifies PNG magic bytes and IHDR width/height match the declared
  `sizes` for both icons.
- `src/pwa-sanity.test.js` — four `describe` blocks: (1) `public/sw.js` structural assertions
  (valid classic-worker JS, versioned cache name, stable-only precache list, no hardcoded hashed
  asset names, stale-cache cleanup on activate, network-first navigation ordering, opaque-response
  SWR caching, fail-open fetch handler, no `skipWaiting`/`clients.claim`); (2) `.github/workflows/deploy.yml`
  structural assertions (trigger, step ordering, secret references, no literal credentials); (3)
  README content assertions (OAuth origins, API enablement, PWA install instructions, offline scope,
  no literal credentials); (4) **`sw.js` embedded classifier semantic parity** — extracts the
  `classifyRequestUrl` function body from `public/sw.js` source via brace-matching, executes it via
  `new Function(...)`, and asserts it returns identical results to `src/sw-policy.js`'s
  `classifyRequestUrl` across a shared URL table (the drift guard for the two hand-mirrored copies).
- `src/index.test.js` — asserts `index.html` contains exactly one `<link rel="manifest">` with
  `href="/manifest.json"` and one `<meta name="theme-color">` with `content="#0ea5e9"`.
- `src/main.test.js` — "Storage Health wiring" / bootstrap suite additions: `createSwRegister`
  invoked exactly once with `{ nav: navigator, config: { prod: <boolean> } }`; `register()` is
  invoked but bootstrap does not await it (fire-and-forget, asserted via a pending promise); a
  rejected `register()` is caught (fails open, `[main]`-prefixed `console.error`, bootstrap still
  resolves).

## Notes
- `public/sw.js` is deliberately **not** an ES module (`self.addEventListener`, no `import`) —
  classic-worker syntax is required for iOS Safari's service worker support.
- The precache-only-stable-files + populate-hashed-assets-lazily design (`SF-3`) means the very
  first offline visit after a fresh deploy may miss a hashed JS chunk if the user never fetched it
  online first; every subsequent visit fixes this since `CACHE_FIRST` populates the cache on first
  successful fetch.
- The Google Sign-In button and step/Drive sync always require connectivity even offline-app-shell:
  `NETWORK_ONLY` for `googleapis.com/fitness/*` and `googleapis.com/drive/*` guarantees tokens and
  sync payloads are never served stale from cache; `STALE_WHILE_REVALIDATE` for the GSI script means
  sign-in itself still needs a live network round trip to complete even though the bootstrap script
  may render from cache momentarily.
- Update model is **update-on-next-visit** by design (no `skipWaiting`/`clients.claim`) — a deployed
  change does not hot-swap an already-open tab; the user must refresh or reopen.
