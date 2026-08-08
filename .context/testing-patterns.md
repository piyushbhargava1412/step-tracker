# Testing Patterns

<!-- context-meta
verification-commit: 87a2be210c32952fad49351243445601b3564a97
generated-at: 2026-08-08T11:16:42+05:30
confidence: high
-->

> **⚠️ NO TESTS DETECTED** — This repository has zero test files, no test runner, and no package
> manager manifests. All sections below describe **recommended patterns** calibrated to the actual
> codebase shape: a **browser-only, dependency-free vanilla JavaScript PWA**.

---

## Test Layers Detected

| Layer              | Detected | Root Path(s)      | Framework / Tool                     |
|--------------------|----------|-------------------|--------------------------------------|
| Unit               | ❌       | Not found         | **Recommended:** Vitest or Jest       |
| Integration        | ❌       | Not found         | Not applicable (no backend)          |
| Functional         | ❌       | Not found         | **Recommended:** Playwright           |
| Acceptance / BDD   | ❌       | Not found         | Not applicable (personal tool scope) |
| Performance / Load | ❌       | Not found         | Not applicable                       |
| Shell Script Tests | ❌       | Not found         | Not applicable                       |

Checked: `**/*.test.{js,ts,mjs}`, `**/*.spec.{js,ts,mjs}`, `test*/`, `__tests__/`,
`**/*.bats`, `tests/`, `features/`, `src/test/`.

---

## Unit Tests — Recommended Patterns

### Bootstrapping (zero-config, no build toolchain required)

Since there is no `package.json`, the fastest path to a working test harness is:

```bash
npm init -y
npm install --save-dev vitest jsdom @vitest/coverage-v8
```

Add to `package.json`:

```json
{
  "scripts": {
    "test":       "vitest run",
    "test:watch": "vitest",
    "test:cover": "vitest run --coverage"
  },
  "type": "module"
}
```

Vitest uses the same Jest API so it is trivially easy to migrate if needed, and it ships
with jsdom for browser environment simulation with no extra plugins.

---

### What to Test (Priority Order)

| Priority | Unit Under Test              | Rationale                                              |
|----------|------------------------------|--------------------------------------------------------|
| 🔴 HIGH  | `parseAndCalculateStreak()`  | Pure function — deterministic, no DOM, no network      |
| 🔴 HIGH  | Streak edge cases            | Off-by-one, empty input, today not yet meeting goal    |
| 🟡 MED   | `getStepsData()` (mocked)    | Chunking math, error path, bucket stitching order      |
| 🟡 MED   | `window.onload` token callback | Token stored, UI state mutations                     |
| 🟢 LOW   | DOM mutation helpers         | innerText, style changes (JSDOM)                       |

---

### Naming Conventions

| Artifact    | Convention                               | Example                          |
|-------------|------------------------------------------|----------------------------------|
| Test file   | `[module].test.js` co-located with src   | `app.test.js`                    |
| Test suite  | `describe('[functionName]', ...)`        | `describe('parseAndCalculateStreak', ...)` |
| Test case   | `it('should [expected] when [condition]')` | `it('should return 0 when no buckets meet goal')` |

---

### Mocking / Stubbing Style

The codebase depends on three external surfaces:

| Dependency                  | Mock Strategy                                                |
|-----------------------------|--------------------------------------------------------------|
| `global.fetch`              | `vi.stubGlobal('fetch', vi.fn().mockResolvedValue({...}))`   |
| `document.getElementById`   | JSDOM auto-provides; seed innerHTML in `beforeEach`          |
| `google.accounts.oauth2`    | `vi.stubGlobal('google', { accounts: { oauth2: { initTokenClient: vi.fn() } } })` |

Use `vi.restoreAllMocks()` in `afterEach` — never let global stubs leak between tests.

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

---

### Canonical Unit Test Skeleton

```js
// app.test.js
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Stub DOM globals before importing app.js
beforeEach(() => {
  document.body.innerHTML = `
    <div id="streak-display"></div>
    <div id="output"></div>
    <button id="auth_btn"></button>
    <button id="fetch_btn" style="display:none"></button>
  `;
  vi.stubGlobal('APP_CONFIG', { CLIENT_ID: 'testid' });
});

afterEach(() => vi.restoreAllMocks());

// Import after DOM is seeded (side effects in window.onload)
const { parseAndCalculateStreak } = await import('./app.js');

function makeBucket(steps) {
  return {
    dataset: [{ point: steps > 0 ? [{ value: [{ intVal: steps }] }] : [] }]
  };
}

describe('parseAndCalculateStreak', () => {
  it('should return 0 when all days are below goal', () => {
    parseAndCalculateStreak({ bucket: [makeBucket(100), makeBucket(200)] });
    expect(document.getElementById('streak-display').innerHTML)
      .toContain('0 Days');
  });

  it('should return streak length from tail of array', () => {
    // Days: miss, miss, hit, hit, hit  → streak = 3
    parseAndCalculateStreak({
      bucket: [makeBucket(0), makeBucket(0),
               makeBucket(4000), makeBucket(4000), makeBucket(4000)]
    });
    expect(document.getElementById('streak-display').innerHTML)
      .toContain('3 Days');
  });

  it('should stop at first miss from the end', () => {
    // Days: hit, hit, miss, hit  → streak = 1 (only last day)
    parseAndCalculateStreak({
      bucket: [makeBucket(4000), makeBucket(4000),
               makeBucket(0), makeBucket(4000)]
    });
    expect(document.getElementById('streak-display').innerHTML)
      .toContain('1 Days');
  });

  it('should handle empty bucket array', () => {
    parseAndCalculateStreak({ bucket: [] });
    expect(document.getElementById('streak-display').innerHTML)
      .toContain('0 Days');
  });

  it('should handle missing bucket key', () => {
    parseAndCalculateStreak({});
    expect(document.getElementById('streak-display').innerHTML)
      .toContain('0 Days');
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
| Coverage report    | `npm run test:cover`       | Outputs HTML to `coverage/`             |
| E2E Tests          | `npx playwright test`      | `npx playwright install` once           |
| Full Suite         | `npm test`                 | Unit tests are the full gate            |

> **CI note:** No `.github/workflows/` detected. When adding CI, the recommended gate command is
> `npm test` (maps to `vitest run`). Add `npm ci` before it to ensure a clean install.

---

## Canonical Example Files

No real test files exist yet. The skeleton above (`app.test.js`) is the reference starting point.

| Layer      | File Path          | Why it's canonical                                      |
|------------|--------------------|---------------------------------------------------------|
| Unit       | `app.test.js`      | Tests `parseAndCalculateStreak` — the only pure function |
| Functional | `tests/e2e/app.spec.js` | Playwright smoke test for full render flow (future)  |

---

## Key Constraints & Caveats

1. **`app.js` has top-level side effects** — `window.onload` fires immediately on import. Use
   `vi.stubGlobal` + DOM seeding in `beforeEach` before importing, or refactor `app.js` to export
   pure functions separately from the entry-point wiring.

2. **`DAILY_STEP_GOAL = 3900` is a file-level constant** — tests must account for this exact value;
   passing `3899` steps is a miss, `3900` is a hit.

3. **No package manager present** — a `package.json` must be created before any test runner
   can be installed. This is a one-time setup step, not a blocker.

4. **Browser-only runtime** — avoid Node-only APIs (`fs`, `path`) in tests. Vitest with
   `environment: 'jsdom'` in `vitest.config.js` is the correct target.
