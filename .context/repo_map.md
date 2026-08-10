# Repository Map

## Context Meta
- verification-commit: `cd96906f6f225737f6ffc4dc188ee71ada14fb17`
- generated-at: `2026-08-10T15:48:19Z`
- confidence: `high`

## Top-Level Layout
- `index.html` — main page shell, Google Identity script include, tab-bar UI
- `styles.css` — styling for dark-themed single-page UI with tab panels
- `src/` — ES module source tree (see Implementation Areas)
- `package.json` — npm manifest; declares Vite, Vitest, Dexie dependencies
- `package-lock.json` — lockfile
- `vite.config.js` — Vite dev/build config and Vitest test config (`jsdom` environment)
- `.env.example` — template for `.env.local` containing `VITE_CLIENT_ID`
- `README.md` — setup guide, Google Cloud Console registration, and Step Sync engine documentation
- `.arcus/plans/PRD.md` — detailed product requirements and future module vision

## Tech Stack
- Languages: JavaScript (ES modules), HTML, CSS, Markdown
- Runtime: Browser-only frontend
- Build / Dev server: Vite 8.x (`vite.config.js`)
- Test framework: Vitest 4.x (jsdom environment, `src/*.test.js`)
- Dependencies: Dexie 4 (IndexedDB wrapper, `src/db.js`)
- External APIs:
  - Google Identity Services (`google.accounts.oauth2.initTokenClient`)
  - Google Fitness REST aggregate endpoint (`users/me/dataset:aggregate`)

## Dependency Managers
- `npm` via `package.json` (Vite 8, Vitest 4, Dexie 4, @vitest/coverage-v8, jsdom)

## Entry Surfaces
- `DOMContentLoaded` → `bootstrap()` in `src/main.js` (composition root)
- UI event handlers (bound in `src/main.js`):
  - `#auth-btn` click → `auth.requestToken()` (from `src/auth.js`)
  - `#sync-btn` click → `stepSync.sync()` then `progressUI.render()` (from `src/steps.js` + `src/progress-ui.js`)
  - `.tab-bar` click (delegated) → `switchTab()` (from `src/tabs.js`)
  - `#goal-selector` delegated click → `goal.setActiveGoal()` then `progressUI.render()` (from `src/goal.js` + `src/progress-ui.js`)
- `DOMContentLoaded` → `bootstrap()` also calls `progressUI.render()` and `streakUI.render()` on load
- Goal changes invoke progress rendering and the streak render callback; sync completion renders both cards

## Implementation Areas
- Composition root / bootstrap: `src/main.js`
- Auth/token state management: `src/auth.js` (`createAuth` factory)
- Configuration validation: `src/config.js` (`VITE_CLIENT_ID` from `import.meta.env`)
- IndexedDB setup: `src/db.js` (`createDb`, `initDB` via Dexie)
- Persistent storage request: `src/storage.js` (`requestPersistentStorage`)
- Tab navigation: `src/tabs.js` (`initTabs`, `switchTab`)
- UI status reporting: `src/ui-status.js` (`createStatusReporter`)
- Step sync engine: `src/steps.js` (`createStepSync` factory; `sync()` orchestrator with two-segment windows, chunked fetch, normalize/upsert, retry, backfill latch)
- Goal Commitment engine: `src/goal.js` (`createGoal` factory; `getActiveGoal`/`setActiveGoal`; persists `active_goal` row in Dexie `settings` store)
- Streak calculation: `src/streak.js` (`createStreak` orchestration plus pure unified/tier/HoF/lifetime calculations)
- Streak renderer: `src/streak-ui.js` (`createStreakUI` factory; `render()` builds `#lifetime-banner` and `#streak-card`)
- Progress computation: `src/progress.js` (pure functions: `getTodayRecord`, `computeProgress`)
- Today's Progress card renderer: `src/progress-ui.js` (`createProgressUI` factory; `render()` builds card + goal-selector into `#tab-dashboard`)
- UI structure: `index.html` (tab-bar + tab-panel layout)
- Presentation: `styles.css` (dark theme, tab bar, panels, progress card, goal-selector)
- Goal-history migration: `src/db.js` (Dexie DB_VERSION 2 adds `goal_history` and seeds valid active goals)

## Testing Surfaces
- Unit tests: `src/*.test.js` (Vitest 4, jsdom) — auth, config, db, storage, tabs, ui-status, main, steps, styles, docs, goal, progress, progress-ui, streak, streak-ui
- Integration/functional/acceptance/performance tests: Not found
- Shell script tests: Not found

## CI/CD
- GitHub workflows: Not found (`.github/workflows/*`)
- Other CI configs (`.gitlab-ci.yml`, `Jenkinsfile`, etc.): Not found
- Pipeline stages: Not found

## Build & Run Commands

| Action | Command | Evidence |
|---|---|---|
| dev server | `npm run dev` | `package.json` scripts.dev = `vite` |
| build | `npm run build` | `package.json` scripts.build = `vite build` |
| test (full suite) | `npm test` | `package.json` scripts.test = `vitest run` |
| test (watch) | `npm run test:watch` | `package.json` scripts.test:watch = `vitest` |
| lint | Not found | no eslint/prettier config detected |
| typecheck | Not found | no TypeScript config detected |

## Interface Contracts & Specs
- OpenAPI/Swagger/AsyncAPI/proto/GraphQL/JSON schema: Not found

## Deployment Manifests
- Kubernetes/Helm/Kustomize/Serverless manifests: Not found

## Scripts & Automation
- Shell scripts (`*.sh`, `*.bash`, `*.zsh`): Not found
- `scripts/`, `bin/`, `tools/`, `hack/`, `ci/`, `cd/`: Not found (repo automation folders)

## Documentation Index
- `README.md`
- `.env.example` (template for `.env.local`)
- `.arcus/plans/PRD.md` (extended product blueprint)

## Commit Convention
- Preferred format: `conventional-commit(scope): message`
- Example: `feat(ST-001): Task 8: tabs.js — delegated client-side tab navigation`
