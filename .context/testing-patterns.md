# Testing Patterns

<!-- context-meta
verification-commit: 8eac5589e7fe87b00de879dba314b4bf7691a8e0
generated-at: 2026-08-10T06:36:28Z
confidence: high
-->

---

## Test Layers Detected

| Layer              | Detected | Root Path(s)      | Framework / Tool                     |
|--------------------|----------|-------------------|--------------------------------------|
| Unit               | ✅       | `src/*.test.js`   | Vitest 4 + jsdom                     |
| Integration        | ❌       | Not found         | Not applicable (no backend)          |
| Functional         | ❌       | Not found         | Playwright (future)                  |
| Acceptance / BDD   | ❌       | Not found         | Not applicable (personal tool scope) |
| Performance / Load | ❌       | Not found         | Not applicable                       |
| Shell Script Tests | ❌       | Not found         | Not applicable                       |

Test files (co-located with source): `src/auth.test.js`, `src/config.test.js`, `src/db.test.js`,
`src/storage.test.js`, `src/tabs.test.js`, `src/ui-status.test.js`, `src/main.test.js`,
`src/steps.test.js`, `src/index.test.js`, `src/sanity.test.js`, `src/styles.test.js`,
`src/docs.test.js`.

---

## Unit Tests — Active Patterns

### Test Runner Setup

Vitest 4 is installed and configured. Run tests with:

```bash
npm test              # vitest run (single pass, CI gate)
npm run test:watch    # vitest (watch mode for dev loop)
```

`vite.config.js` configures `test.environment = 'jsdom'` and `test.globals = true` so all
Vitest globals (`describe`, `it`, `expect`, `vi`, etc.) are available without explicit imports.

---

### What to Test (Priority Order)

| Priority | Unit Under Test                | Rationale                                                       |
|----------|--------------------------------|-----------------------------------------------------------------|
| ✅ DONE  | `createAuth` (`src/auth.js`)   | Factory + token callback — deterministic with injected GSI mock |
| ✅ DONE  | `src/config.js`                | `VITE_CLIENT_ID` validation and export                          |
| ✅ DONE  | `createDb` / `initDB`          | Dexie schema setup and DB open/count path                       |
| ✅ DONE  | `requestPersistentStorage`     | Navigator mock, granted/denied branches                         |
| ✅ DONE  | `initTabs` / `switchTab`       | Delegated click, panel show/hide, AbortController cleanup       |
| ✅ DONE  | `createStatusReporter`         | `#db-status` / `#auth-status` DOM mutation                      |
| ✅ DONE  | `bootstrap()` (`src/main.js`)  | Composition root integration — module wiring                    |
| ✅ DONE  | Step sync (`createStepSync`, `src/steps.js`) | Sync orchestrator — guards, window resolution, chunking, normalisation, retry/error contract, transactional upsert, backfill latch (`src/steps.test.js`, 158 tests) |
| 🔴 HIGH  | `parseAndCalculateStreak()`    | Not yet re-implemented; add once streak module lands in `src/`  |

---

### Naming Conventions

| Artifact    | Convention                               | Example                          |
|-------------|------------------------------------------|----------------------------------|
| Test file   | `[module].test.js` co-located with src   | `auth.test.js`                   |
| Test suite  | `describe('[exportName]', ...)`          | `describe('createAuth', ...)`    |
| Test case   | `it('[action] [expected condition]', ...)` | `it('callback with valid access_token stores the token', ...)` |

---

### Mocking / Stubbing Style

Modules use dependency injection (DI) so external surfaces are **injected rather than stubbed globally**:

| Dependency                  | Mock Strategy                                                          |
|-----------------------------|------------------------------------------------------------------------|
| `google.accounts.oauth2`    | Pass a `mockGsi` object as the third arg to `createAuth(config, reporter, mockGsi)` |
| `document` / DOM            | Pass `doc` param to factory functions; JSDOM auto-provides the default |
| `navigator.storage`         | Pass a `nav` mock object to `requestPersistentStorage(reporter, nav)` |
| `dexie`                     | `vi.mock('dexie', ...)` module mock for `createDb`/`initDB` tests     |
| `global.fetch`              | `vi.stubGlobal('fetch', vi.fn().mockResolvedValue({...}))` when needed |

Use `vi.restoreAllMocks()` in `afterEach` — never let stubs leak between tests.

---

### Assertion Style

- Use Vitest's built-in `expect` (Jest-compatible).
- Prefer `toBe` for primitives, `toEqual` for objects/arrays, `toStrictEqual` when shape matters.
- For DOM: `toContain`, `toMatch` on `element.innerHTML`.

```js
// Good — explicit and readable
expect(currentStreak).toBe(5);
expect(streakDisplay.innerHTML).toContain('5 Days');

// Avoid — too loose
expect(result).toBeTruthy();
```

---

### Test Data / Fixture Patterns

`parseAndCalculateStreak` accepts a plain `{ bucket: [...] }` object — build minimal inline
fixtures; no factory library needed.

```js
// Canonical fixture builder (inline, no deps)
function makeBucket(steps) {
  return {
    dataset: [{ point: steps > 0 ? [{ value: [{ intVal: steps }] }] : [] }]
  };
}

function makeData(...stepValues) {
  return { bucket: stepValues.map(makeBucket) };
}
```

Shared step-sync fixtures (in-memory Dexie doubles, scripted helpers) are hoisted into a
co-located `src/steps.fixtures.js` module imported by `src/steps.test.js`, so a fixture fix is
made in exactly one place.

---

### Canonical Unit Test Skeleton

The actual `src/auth.test.js` is the canonical reference for the DI-based factory test pattern:

```js
// src/auth.test.js (canonical)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuth } from './auth.js';

describe('createAuth', () => {
  let config, reporter, mockGsi, capturedCallback, mockTokenClient, auth;

  beforeEach(() => {
    config = { CLIENT_ID: 'cid_001' };
    reporter = { auth: vi.fn(), db: vi.fn() };
    capturedCallback = null;
    mockTokenClient = { requestAccessToken: vi.fn() };
    mockGsi = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn((opts) => {
            capturedCallback = opts.callback;
            return mockTokenClient;
          }),
        },
      },
    };
    auth = createAuth(config, reporter, mockGsi);
    auth.init();
  });

  it('init() calls initTokenClient exactly once', () => {
    expect(mockGsi.accounts.oauth2.initTokenClient).toHaveBeenCalledTimes(1);
  });

  it('callback with valid access_token stores the token', () => {
    capturedCallback({ access_token: 'tok-123' });
    expect(auth.getAccessToken()).toBe('tok-123');
  });
});
```

---

## Functional / E2E Tests — Recommended Patterns

For end-to-end smoke testing of the UI without Google auth being real:

```bash
npm install --save-dev playwright @playwright/test
npx playwright install chromium
```

Key approach:
- **Stub `google.accounts.oauth2`** and `fetch` via `page.addInitScript()` before navigation.
- Assert the streak banner renders with expected text.
- Keep E2E tests in `tests/e2e/` to separate concerns from unit tests.

These are **not a Phase-1 blocker** — unit tests on `parseAndCalculateStreak` deliver the highest
value per line of test code written.

---

## Execution Patterns

| Test Type          | Command                    | Prerequisites                           |
|--------------------|----------------------------|-----------------------------------------|
| Unit Tests         | `npm test`                 | `npm install` first; no network needed  |
| Unit (watch)       | `npm run test:watch`       | Dev loop; re-runs on file change        |
| Coverage report    | `vitest run --coverage`    | Outputs HTML to `coverage/`             |
| E2E Tests          | `npx playwright test`      | `npx playwright install` once (future)  |
| Full Suite         | `npm test`                 | Unit tests are the full gate            |

> **CI note:** No `.github/workflows/` detected. When adding CI, the gate command is
> `npm test` (maps to `vitest run`). Add `npm ci` before it to ensure a clean install.

---

## Canonical Example Files

| Layer      | File Path               | Why it's canonical                                             |
|------------|-------------------------|----------------------------------------------------------------|
| Unit       | `src/auth.test.js`      | DI factory pattern — injected GSI mock, no global stubs        |
| Unit       | `src/db.test.js`        | Module mock pattern — `vi.mock('dexie', ...)` for class fakes  |
| Unit       | `src/tabs.test.js`      | DOM delegation + AbortController cleanup testing               |
| Unit       | `src/main.test.js`      | Composition-root integration test using imported factories      |
| Unit       | `src/steps.test.js`     | Sync engine contract — chunked fetch, retry/401/network/Dexie error paths, backfill latch |
| Functional | `tests/e2e/app.spec.js` | Playwright smoke test for full render flow (future)            |

---

## Key Constraints & Caveats

1. **`src/main.js` guards against DOMContentLoaded in test mode** — the listener is only registered
   when `import.meta.env.MODE !== 'test'`. In tests, dispatch `DOMContentLoaded` manually after
   mocks are configured, or call `bootstrap(doc)` directly with an injected `doc`.

2. **`src/config.js` throws at import time if `VITE_CLIENT_ID` is missing** — tests that import
   config must stub `import.meta.env` before the module loads, or use `vi.mock('./config.js', ...)`.

3. **`DAILY_STEP_GOAL = 3900` was hardcoded** — when streak calculation is re-introduced in `src/`,
   extract it as an injectable parameter so tests can pass a known goal without matching the magic number.

4. **Browser-only runtime** — avoid Node-only APIs (`fs`, `path`) in tests. `vite.config.js` sets
   `test.environment = 'jsdom'` as the baseline.
