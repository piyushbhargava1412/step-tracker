# Repository Map

## Context Meta
- verification-commit: `87a2be210c32952fad49351243445601b3564a97`
- generated-at: `2026-08-08T11:15:26.386+05:30`
- confidence: `high`

## Top-Level Layout
- `index.html` — main page shell, Google Identity script include, UI controls
- `styles.css` — styling for dark-themed single-page UI
- `app.js` — OAuth init, token request, Google Fit fetch loop, streak calculation
- `config.example.js` — sample `window.APP_CONFIG.CLIENT_ID`
- `config.local.js` — local secret config (gitignored)
- `README.md` — minimal project title
- `.arcus/plans/PRD.md` — detailed product requirements and future module vision

## Tech Stack
- Languages: JavaScript, HTML, CSS, Markdown
- Runtime: Browser-only frontend
- External APIs:
  - Google Identity Services (`google.accounts.oauth2.initTokenClient`)
  - Google Fitness REST aggregate endpoint (`users/me/dataset:aggregate`)

## Dependency Managers
- None detected (no `package.json`, `pom.xml`, `pyproject.toml`, `go.mod`, etc.)

## Entry Surfaces
- `window.onload` initializes OAuth token client (`app.js`)
- UI event handlers:
  - `requestToken()` from `#auth_btn`
  - `getStepsData()` from `#fetch_btn`
- Core computation:
  - `parseAndCalculateStreak(data)`

## Implementation Areas
- Auth/token state management: `app.js` (top section)
- Data sync/chunking logic: `getStepsData()` in `app.js`
- Streak calculation/rendering: `parseAndCalculateStreak()` in `app.js`
- UI structure: `index.html`
- Presentation: `styles.css`

## Testing Surfaces
- Unit tests: Not found
- Integration/functional/acceptance/performance tests: Not found
- Shell script tests: Not found

## CI/CD
- GitHub workflows: Not found (`.github/workflows/*`)
- Other CI configs (`.gitlab-ci.yml`, `Jenkinsfile`, etc.): Not found
- Pipeline stages: Not found

## Build & Run Commands

| Action | Command | Evidence |
|---|---|---|
| build | Not found — checked: `.github/workflows/*`, `package.json`, `Makefile`, `Taskfile.yml`, README | no matching files/commands |
| run | Not found — checked: same as above | no matching files/commands |
| lint | Not found — checked: same as above | no matching files/commands |
| lint-autofix | Not found — checked: same as above | no matching files/commands |
| format-check | Not found — checked: same as above | no matching files/commands |
| format-write | Not found — checked: same as above | no matching files/commands |
| typecheck | Not found — checked: same as above | no matching files/commands |
| static analysis | Not found — checked: same as above | no matching files/commands |

## Interface Contracts & Specs
- OpenAPI/Swagger/AsyncAPI/proto/GraphQL/JSON schema: Not found

## Deployment Manifests
- Kubernetes/Helm/Kustomize/Serverless manifests: Not found

## Scripts & Automation
- Shell scripts (`*.sh`, `*.bash`, `*.zsh`): Not found
- `scripts/`, `bin/`, `tools/`, `hack/`, `ci/`, `cd/`: Not found (repo automation folders)

## Documentation Index
- `README.md`
- `.arcus/plans/PRD.md` (extended product blueprint)

## Commit Convention
- Preferred commit format: `Author | commit message`
- Example: `Piyush | Extract CLIENT_ID into local gitignored config`
