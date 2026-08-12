# Design & Coding Patterns

<!-- context-meta
verification-commit: 5b8eb0c5d614769c18de8433d4ce0b29857eafdd
generated-at: 2026-08-12T00:00:00Z
confidence: high
-->

> **Static by design.** This artifact captures the repository's *settled* design & coding conventions.
> It is NOT regenerated on routine diffs — `context-drift-sync` updates it only when a genuinely new
> team-level pattern/convention/idiom is adopted.
>
> The codebase was refactored in ST-001 from a flat single-file structure to a modular `src/` tree
> with Vite + Vitest. Several conventions documented below supersede earlier "Recommended defaults."
> Entries are split into:
> - **Observed** — grounded in actual repository evidence (occurrence counts cited).
> - **Recommended default** — NOT yet an established convention; proposed baselines for downstream
>   agents to follow so new code stays internally consistent. These are advisory until they recur ≥3×.

---

## Conventions Overview

| Dimension                       | Documented | Summary                                                                           |
|---------------------------------|------------|-----------------------------------------------------------------------------------|
| Design patterns in use          | ✅ observed | Factory functions (DI) + fail-open guard clauses; event-delegation for tab nav.   |
| Layering & structure            | ✅ observed | Modular `src/` tree: one concern per file, composition root in `src/main.js`.     |
| Naming & idioms                 | ✅ observed | `UPPER_SNAKE` constants, `camelCase` functions, `createXxx` factory naming.       |
| Error-handling & logging        | ✅ observed | `try/catch/finally` around async I/O; `console.error` + reporter abstraction.     |
| Configuration & dependencies    | ✅ observed | `import.meta.env.VITE_CLIENT_ID` via `.env.local`; Vite + Vitest + Dexie.        |

---

## Design Patterns In Use

<!-- Recurring structural/behavioral patterns actually present in the code. -->

**Observed**

- **Factory function with dependency injection (`createXxx(deps)`)**: modules export a factory that
  accepts external collaborators as parameters and returns a plain object of methods. This makes each
  module testable without global stubs. *Evidence (≥3)*: `createAuth(config, reporter, gsi)` in
  `src/auth.js`; `createStatusReporter(doc)` in `src/ui-status.js`; `createDb()` / `initDB(db, reporter)`
  in `src/db.js`; `initTabs(barEl, doc)` / `switchTab(tabName, doc)` in `src/tabs.js`.
- **Fail-open guard clause at function entry**: functions validate preconditions and return/throw early
  before doing work. *Evidence (≥3)*: `src/config.js` (throw if `VITE_CLIENT_ID` missing);
  `src/auth.js:requestToken()` (`if (!tokenClient) return`); `src/storage.js`
  (`if (!nav?.storage?.persist) return`); `src/ui-status.js` element-missing guards.
- **Delegated event listener with AbortController cleanup**: a single listener on a container element
  reads `event.target.closest('[data-tab]')` rather than attaching per-button listeners. Re-calling
  the init function aborts the old controller to prevent accumulation. *Evidence*: `src/tabs.js:initTabs`,
  `src/calendar-ui.js:render()` (one controller per render cycle, aborted at top of next render).
- **Pure engine / sole DOM-writer pair**: engine module imports no DOM and no Dexie symbols; a separate
  `-ui.js` module is the only file that touches the document. Established across all feature areas.
  *Evidence (≥3)*: `src/streak.js`/`src/streak-ui.js`; `src/progress.js`/`src/progress-ui.js`;
  `src/calendar.js`/`src/calendar-ui.js`.
- **Shared pure module extracted to avoid duplication**: when multiple feature engines share a
  utility or algorithmic building block, it is extracted into its own module rather than duplicated
  or placed in a utils grab-bag. The extracted module is pure (no DOM, no Dexie) and exports its
  primitives at the fine-grained level needed by all callers. *Evidence (≥3)*: `src/date-utils.js`
  (`_localDate`, `_daysBetween`, `_parseLocalDate` — shared by `goal.js`, `streak.js`, `steps.js`,
  `exporter.js`, and others); `src/units.js` (`KM_TO_STEPS` — shared by `progress.js`, `records.js`).
- **Pure export beside factory (not inside closure)**: when a module's primary export is a factory
  (`createXxx`), supplementary pure functions that are independently testable and do not require the
  factory's closed-over state are exported as named module-level exports rather than being nested
  inside the factory closure. This keeps the factory surface minimal and allows callers to import
  only the pure function without instantiating the factory. *Evidence*: `src/search.js` exports
  `computeNearMisses(records, stepTarget)` at module level alongside the `createSearch(db)` factory;
  `src/calendar.js` exports `classifyDay`, `buildMonthGrid`, `computeMonthlyAggregates`, etc. as
  named exports alongside `createCalendar`.
- **Scalar-lens goal (no per-date resolution)**: goal state is stored and read as a single integer
  (`target_steps`). No `effective_from` date-scoping, no per-date goal-history resolution, and no
  `goal_history` table. Any computation that needs a goal value for a historical day uses the
  single active step goal uniformly. This rule prevents the "effective goal history" complexity from
  creeping back into streak, calendar, or search modules. *Evidence*: `src/goal.js`
  (`getActiveStepGoal` returns a plain integer; no `effective_from` field); `src/streak.js`
  (passes scalar `target` to `computeToleranceStreaks`); `src/calendar.js`
  (`classifyDay(record, stepGoal, isFuture)` receives the scalar directly).

**Superseded (was "Recommended default", now established)**

- **Adapter/gateway isolation for external APIs**: implemented — each external API is behind a
  single-purpose module (`src/auth.js` for Google Identity, `src/db.js` for Dexie/IndexedDB).
- **Pure computation separated from rendering**: newly adopted recommendation — streak calculation
  (when re-introduced) should return values from a pure function; a separate thin render layer writes
  DOM. `src/ui-status.js` models this separation for status reporting.

## Layering & Structure Conventions

**Observed**

- **Layering**: Modular ES-module tree under `src/`, built and served by Vite. Load order:
  presentation shell (`index.html`) → `<script type="module" src="/src/main.js">` → `src/main.js`
  imports each module (`auth`, `config`, `db`, `storage`, `tabs`, `ui-status`) via named imports.
  *Evidence*: `index.html` (entry script tag); `src/main.js` import block at top of file.
- **Module granularity**: One-concern-per-file enforced across `src/` — each module owns a single
  external surface or domain concept. *Evidence (≥3)*: `src/auth.js` (Google Identity only);
  `src/db.js` (Dexie schema + open); `src/storage.js` (navigator.storage only); `src/tabs.js`
  (tab nav only); `src/ui-status.js` (DOM status reporter only); `src/config.js` (env var validation).
- **Composition root**: `src/main.js` is the sole wiring point — it imports all concrete modules,
  instantiates them in sequence, and binds event handlers. No other module knows about the others.
  *Evidence*: `src/main.js:bootstrap()` function.
- **Cross-cutting state**: no module-level mutable singletons — state lives inside factory closures
  and is returned via the factory object (`accessToken`, `tokenClient` in `createAuth` closure).
  *Evidence*: `src/auth.js` (closure), vs. old `app.js:7-8` (module-level `let`).

## Naming & Idioms

**Observed**

- **Symbol naming**: Tunable constants are `UPPER_SNAKE_CASE` (`CLIENT_ID`, `SCOPES`, `DB_NAME`,
  `DB_VERSION`); factory functions use `createXxx` (`createAuth`, `createDb`, `createStatusReporter`);
  plain functions use `camelCase` (`initTabs`, `switchTab`, `requestPersistentStorage`).
  *Evidence (≥3 each)*: `src/config.js:1` (constant); `src/auth.js:1` (SCOPES); `src/db.js:1-2`
  (DB_NAME, DB_VERSION); factories across `src/auth.js`, `src/db.js`, `src/ui-status.js`.
- **DOM-id-driven wiring**: elements are addressed by fixed string ids via `getElementById`; ids use
  `kebab-case` (`auth-btn`, `auth-status`, `db-status`, `tab-dashboard`, …). *Evidence (≥3)*:
  `src/main.js:getElementById('auth-btn')`; `src/ui-status.js:getElementById('db-status')`
  and `getElementById('auth-status')`; `src/tabs.js:getElementById('tab-'+tabName)`.
- **Idiomatic constructs**: optional chaining for defensive reads (`src/storage.js:nav?.storage?.persist`);
  data attributes for UI configuration (`data-tab="dashboard"` in `index.html`);
  template literals for status strings (`src/ui-status.js`).

## Error-Handling & Logging Conventions

**Observed**

- **Error propagation**: `throw new Error(...)` for hard failures with a descriptive message
  (`src/config.js` missing `VITE_CLIENT_ID`). Async I/O is wrapped in `try / catch` (fail-open in
  bootstrap steps so later modules still initialize). *Evidence*: `src/config.js:4-7`;
  `src/main.js:bootstrap()` try/catch around `initDB` and `requestPersistentStorage`.
- **Status reporter abstraction**: user-facing status is routed through `createStatusReporter` rather
  than written directly to DOM — `reporter.auth(text)` and `reporter.db(text)` update `#auth-status`
  and `#db-status`. Emoji-prefix convention retained: `✅` success, `❌` failure, `⚠️` warning,
  `💾` granted. Developer diagnostics go to `console.error` with a `[module]` context prefix.
  *Evidence*: `src/ui-status.js`; `src/auth.js`; `src/db.js`; `src/storage.js`.
- **Defaults**: **fail-closed** on missing config (throws at module load, `src/config.js`);
  **fail-open/graceful** on runtime gaps — `src/main.js` catches DB and storage failures and
  continues; `src/storage.js` handles missing `navigator.storage` gracefully.

## Configuration & Dependency Conventions

**Observed**

- **Configuration**: read from `import.meta.env.VITE_CLIENT_ID` (Vite environment variable), defined
  in a **gitignored** `.env.local` copied from the checked-in `.env.example`. Validated at module-load
  time with a fail-closed throw. *Evidence*: `src/config.js:1-9`, `.env.example`, `.gitignore`
  (ignores `.env.local`), `vite.config.js` (Vite processes `VITE_*` env vars).
- **Dependencies**: `npm` + `package.json`; runtime dep — `dexie@^4` (IndexedDB wrapper);
  dev deps — `vite@^8`, `vitest@^4`, `@vitest/coverage-v8`, `jsdom`. The Google Identity Services
  script is still loaded as a runtime `<script src="https://accounts.google.com/gsi/client">` at
  `index.html:8` (no npm package). Google Fit REST API called via `fetch`.
  *Evidence*: `package.json`, `vite.config.js`, `index.html:8`.

---

## Canonical Examples

| Dimension / Pattern                          | File Path              | Why it's canonical                                                              |
|----------------------------------------------|------------------------|---------------------------------------------------------------------------------|
| Factory function + DI pattern                | `src/auth.js`          | `createAuth(config, reporter, gsi)` — canonical factory shape                  |
| Composition root                             | `src/main.js`          | Wires all factories; fail-open bootstrap; `DOMContentLoaded` guard             |
| Module mock in tests (class constructor)     | `src/db.test.js`       | `vi.mock('dexie', ...)` pattern for external class dependencies                |
| Delegated listener + AbortController cleanup | `src/tabs.js`          | `initTabs(barEl, doc)` — event delegation + re-init safety                     |
| Status reporter abstraction                  | `src/ui-status.js`     | `createStatusReporter(doc)` — DI seam keeping modules DOM-agnostic             |
| Config injection contract                    | `.env.example`         | Gold-standard shape of `.env.local`; `VITE_CLIENT_ID` placeholder             |
| Presentation shell + module entry            | `index.html`           | Tab-bar structure + `<script type="module" src="/src/main.js">`                |
| Dark-theme + tab-panel presentation          | `styles.css`           | Central styling for tab bar, panels, dark theme                                |
| Pure export beside factory                   | `src/search.js`        | `computeNearMisses` exported at module level alongside `createSearch` factory  |
| Scalar-lens goal pattern                     | `src/goal.js`          | `getActiveStepGoal` returns integer; no per-date history, no km fields         |
| Shared pure utility module                   | `src/date-utils.js`    | `_localDate` / `_daysBetween` — single source for timezone-safe date helpers   |

---

## Anti-patterns to Avoid

<!-- PRESCRIPTIVE RULES ONLY — not a list of offending files. -->

| Avoid (anti-pattern)                                              | Do instead (preferred convention)                                                       | Grounded in                                                       |
|------------------------------------------------------------------|-----------------------------------------------------------------------------------------|-------------------------------------------------------------------|
| Committing real secrets / client IDs into tracked source         | Put secrets only in gitignored `.env.local`; ship a placeholder `.env.example`          | `.gitignore`, `.env.example` convention                           |
| Hardcoding configuration inline in source modules               | Read from `import.meta.env.VITE_*` and validate in `src/config.js`                     | `src/config.js` config convention                                 |
| Importing DOM or globals directly inside a module               | Accept `doc`, `nav`, `gsi`, etc. as factory parameters for testability                 | DI factory pattern across `src/`                                  |
| Attaching event listeners directly in each module               | Route listeners through the composition root (`src/main.js`); use delegated listeners  | `src/main.js` composition root + `src/tabs.js` delegation pattern |
| Firing async I/O without failure/cleanup handling               | Wrap async flows in `try/catch`; use fail-open at bootstrap, fail-closed on config     | `src/main.js:bootstrap()`, `src/config.js` error convention       |
| Growing a shared monolithic logic file                          | Introduce a new `src/` module per concern; wire it in `src/main.js`                   | Modular layering convention                                        |
| Assuming external API payloads are fully populated              | Guard nested reads with optional chaining and provide defaults                          | `src/storage.js` optional-chaining pattern                        |
| Referencing DOM elements by ad-hoc/duplicated selector strings  | Use established fixed element ids via `getElementById`; use `data-*` for config        | `src/main.js`, `src/ui-status.js`, `src/tabs.js` id-wiring       |
| Introducing magic numbers with no explanation                   | Name them as `UPPER_SNAKE` constants and/or add an inline unit comment                  | `src/db.js` (DB_NAME, DB_VERSION), `src/auth.js` (SCOPES)        |
| Silently swallowing errors                                      | Log to `console.error` with `[module]` context AND surface via `reporter` method        | `src/ui-status.js`, `src/db.js`, `src/storage.js` logging pattern |
| Using `innerHTML` for DOM mutations in render layers            | Use `textContent` for text; `createElement`/`appendChild`/`replaceChildren()` for structure; never `innerHTML` assignment (XSS injection surface, especially for user-authored content like `override.note`) | `src/calendar-ui.js` (no-innerHTML contract, enforced by `src/calendar-ui.test.js` via `fs.readFileSync`) |
| Nesting a pure function inside a factory closure unnecessarily  | Export pure functions at module level alongside the factory (`createXxx`) when they do not depend on factory-closed-over state | `src/search.js` — `computeNearMisses` is a named module export, not a closure member |
| Per-date goal resolution over a stored history table            | Use the scalar-lens pattern: a single active step-goal integer applied uniformly to all historical days; never add an `effective_from` field or `goal_history` table | `src/goal.js`, `src/streak.js`, `src/calendar.js` — scalar step goal |
