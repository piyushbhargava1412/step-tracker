# Design & Coding Patterns

<!-- context-meta
verification-commit: 87a2be210c32952fad49351243445601b3564a97
generated-at: 2026-08-08T11:16:42.349+05:30
confidence: medium
-->

> **Static by design.** This artifact captures the repository's *settled* design & coding conventions.
> It is NOT regenerated on routine diffs — `context-drift-sync` updates it only when a genuinely new
> team-level pattern/convention/idiom is adopted.
>
> ⚠️ **Greenfield caveat.** This is an early-stage, single-author, backendless web app (~5 first-party
> source files, no build tooling, no tests). Very few conventions clear the normal **≥3 distinct
> occurrences** bar. Below, entries are split into:
> - **Observed** — grounded in actual repository evidence (occurrence counts cited).
> - **Recommended default** — NOT yet an established convention; proposed baselines for downstream
>   agents to follow so new code stays internally consistent. These are advisory until they recur ≥3×.

---

## Conventions Overview

| Dimension                       | Documented | Summary                                                                     |
|---------------------------------|------------|-----------------------------------------------------------------------------|
| Design patterns in use          | ⚠️ partial | Event-handler UI dispatch + fail-open guard clauses observed; rest thin.    |
| Layering & structure            | ✅ observed | Flat single-page structure: HTML shell → global config → `app.js` logic.    |
| Naming & idioms                 | ✅ observed | `UPPER_SNAKE` module constants, `camelCase` functions, DOM-id-driven wiring. |
| Error-handling & logging        | ✅ observed | `try/catch/finally` around async I/O; `console.error` + inline HTML status. |
| Configuration & dependencies    | ✅ observed | `window.APP_CONFIG` global via gitignored `config.local.js`; zero deps.      |

---

## Design Patterns In Use

<!-- Recurring structural/behavioral patterns actually present in the code. -->

**Observed**

- **DOM event-handler dispatch (inline `onclick` → global function)**: UI actions are wired by inline
  `onclick` attributes calling top-level functions in `app.js`. *Evidence (≥3)*: `index.html:15`
  (`onclick="requestToken()"`), `index.html:16` (`onclick="getStepsData()"`), and the callback wiring
  in `app.js:14-21` (`initTokenClient({ callback })`).
- **Fail-open guard clause at function entry**: functions validate preconditions and return/throw early
  before doing work. *Evidence (≥3)*: `app.js:2-4` (throw if `CLIENT_ID` missing), `app.js:29`
  (`if (!accessToken) return alert(...)`), `app.js:77` (`if (data.bucket)` guard), `app.js:100`
  (`if (bucket.dataset[0].point.length > 0)`).

**Recommended defaults (not yet a convention)**

- **Adapter/gateway isolation for external APIs**: Google Fit `fetch` and Google Identity token flow are
  currently inline in `app.js`. As the app grows (see PRD's module vision), isolate each external API
  behind a single-purpose function/module so callers don't hand-build requests.
- **Pure computation separated from rendering**: `parseAndCalculateStreak()` (`app.js:94`) both computes
  the streak *and* writes DOM. Recommended: keep streak/statistics math pure and return values, with a
  thin render layer — this eases the analytics/spatial modules the PRD anticipates.

## Layering & Structure Conventions

**Observed**

- **Layering**: Flat, browser-only, three-tier load order — presentation shell (`index.html`) →
  configuration (`config.local.js` global) → behavior (`app.js`). *Evidence*: `index.html:22-23` loads
  `config.local.js` **before** `app.js`; `styles.css` linked at `index.html:7`.
- **Module granularity**: One-concern-per-file at the top level — markup, styling, logic, and config are
  each in their own file. *Evidence*: `index.html` (structure), `styles.css` (presentation), `app.js`
  (all logic), `config.*.js` (config). Matches `repo_map.md` Top-Level Layout.
- **Shared / cross-cutting code**: There is a single logic file (`app.js`); no shared-utility layer
  exists yet. Cross-cutting state (`tokenClient`, `accessToken`) lives as module-level `let` at the top
  of `app.js:7-8`.

**Recommended default (not yet a convention)**

- The PRD (`.arcus/plans/PRD.md`) envisions tabbed modules (Dashboard, Calendar, Search, Spatial) and
  IndexedDB persistence. When that lands, introduce a feature-folder or module split; keep the
  established one-concern-per-file discipline rather than growing a monolithic `app.js`.

## Naming & Idioms

**Observed**

- **Symbol naming**: Tunable constants are `UPPER_SNAKE_CASE` (`CLIENT_ID`, `SCOPE`, `TOTAL_DAYS`,
  `CHUNK_DAYS`, `DAILY_STEP_GOAL`); functions and mutable locals are `camelCase` (`requestToken`,
  `getStepsData`, `parseAndCalculateStreak`, `combinedBuckets`, `dailyTotals`). *Evidence (≥3 each)*:
  `app.js:1,5,38-39,106` (constants); `app.js:24,28,94` (functions).
- **DOM-id-driven wiring**: elements are addressed by fixed string ids via `getElementById`; ids use
  `snake_case`/`kebab-case` (`auth_btn`, `fetch_btn`, `streak-display`, `output`). *Evidence (≥3)*:
  `app.js:17,18,31,32,117,120` referencing ids declared in `index.html:15,16,18,19`.
- **Idiomatic constructs**: template literals for building request bodies / status HTML
  (`app.js:51,56,87,117`); optional chaining for defensive config reads (`app.js:1`
  `window.APP_CONFIG?.CLIENT_ID`); "magic number with an explanatory inline comment" idiom
  (`app.js:38,39,64,106`).

## Error-Handling & Logging Conventions

**Observed**

- **Error propagation**: `throw new Error(...)` for hard failures with a descriptive message
  (`app.js:3` missing config, `app.js:71` non-OK HTTP). Async I/O is wrapped in
  `try / catch / finally`, with `finally` restoring UI state (button re-enabled, label reset).
  *Evidence*: `app.js:45-91`.
- **Message / format conventions**: user-facing status is emoji-prefixed HTML injected into
  `#streak-display` — `⏳` in-progress (`app.js:36,51`), `❌` failure with red inline style
  (`app.js:87`), `🔥` success (`app.js:118`). Developer diagnostics go to `console.error` with a
  context string + the error object (`app.js:86`).
- **Defaults**: **fail-closed** on missing config (throws at load, `app.js:2-4`); **fail-open/graceful**
  on runtime data gaps (missing points default steps to `0` at `app.js:99-102`; empty `data.bucket`
  guarded at `app.js:77`). User is alerted, not blocked, when unauthenticated (`app.js:29`).

## Configuration & Dependency Conventions

**Observed**

- **Configuration**: injected via a single browser global `window.APP_CONFIG`, defined in a **gitignored**
  `config.local.js` that is copied from the checked-in `config.example.js`. Read defensively with
  optional chaining and validated at startup. *Evidence*: `config.example.js:2-4`, `config.local.js:2-4`,
  `app.js:1-4`, `.gitignore` (ignores `config.local.js`), loaded at `index.html:22`.
- **Dependencies**: **zero build-time dependencies / no package manager** (confirmed by `repo_map.md`
  Dependency Managers: None). The only external dependency is the Google Identity Services script loaded
  by `<script src="https://accounts.google.com/gsi/client">` at runtime (`index.html:9`). The Google Fit
  REST API is called directly via `fetch` (`app.js:53`).

**Recommended default (not yet a convention)**

- Keep the backendless, no-bundler stance (a core PRD principle). New external capabilities should prefer
  a runtime `<script>` include or direct `fetch` over introducing a package manager, unless a build step
  becomes genuinely necessary.

---

## Canonical Examples

| Dimension / Pattern                       | File Path            | Why it's canonical                                                          |
|-------------------------------------------|----------------------|-----------------------------------------------------------------------------|
| Behavior/logic layer + async error idiom  | `app.js`             | Only logic file; shows guard clauses, `try/catch/finally`, constants, wiring |
| Presentation shell + load-order + wiring  | `index.html`         | Canonical three-tier load order and inline-`onclick` → global-fn dispatch    |
| Config injection contract                 | `config.example.js`  | Gold-standard shape of `window.APP_CONFIG`; template for `config.local.js`   |
| Dark-theme presentation conventions       | `styles.css`         | Central `.container`/`button`/id-based styling for the single-page UI        |

---

## Anti-patterns to Avoid

<!-- PRESCRIPTIVE RULES ONLY — not a list of offending files. -->

| Avoid (anti-pattern)                                              | Do instead (preferred convention)                                             | Grounded in                                             |
|------------------------------------------------------------------|-------------------------------------------------------------------------------|---------------------------------------------------------|
| Committing real secrets / client IDs into tracked source         | Put secrets only in gitignored `config.local.js`; ship a placeholder example   | `.gitignore`, `config.example.js` vs `config.local.js`  |
| Hardcoding the Google Client ID inline in `app.js`               | Read it from `window.APP_CONFIG` with an optional-chaining + validation guard  | `app.js:1-4` config convention                          |
| Firing async I/O without failure/cleanup handling                | Wrap async flows in `try/catch/finally`; restore UI state in `finally`         | `app.js:45-91` error convention                         |
| Assuming external API payloads are fully populated               | Guard nested reads and default missing metrics (fail-open on data gaps)        | `app.js:77,99-102` defensive-read convention            |
| Referencing DOM elements by ad-hoc/duplicated selector strings   | Use the established fixed element ids via `getElementById`                      | `app.js` + `index.html` id-wiring convention            |
| Adding a bundler / package manager for a small capability        | Prefer runtime `<script>` include or direct `fetch`; stay backendless          | `repo_map.md` (no dep managers), PRD "Backendless" tenet |
| Introducing magic numbers with no explanation                    | Name them as `UPPER_SNAKE` constants and/or add an inline unit comment         | `app.js:38-39,64,106` constant convention               |
| Silently swallowing errors                                       | Log to `console.error` with context AND surface an emoji-prefixed user status  | `app.js:86-87` logging convention                       |
