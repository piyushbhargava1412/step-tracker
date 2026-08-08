# Repository Scope

## Context Meta
- verification-commit: `87a2be210c32952fad49351243445601b3564a97`
- generated-at: `2026-08-08T11:15:26.386+05:30`
- confidence: `high`

## Purpose
This repository is a client-side step streak tracker web app that connects to Google Identity + Google Fitness APIs, fetches historical daily step buckets, and computes/displays a current streak against a fixed daily goal.

## In-Scope Responsibilities
- Browser UI for auth/connect and sync actions (`index.html`, `styles.css`)
- Google OAuth token acquisition in-browser (`app.js`)
- Google Fitness aggregate API calls (daily buckets over chunked history) (`app.js`)
- Streak computation and output rendering (`app.js`)
- Local client configuration via global app config (`config.example.js`, `config.local.js`)
- Product direction context in PRD (`.arcus/plans/PRD.md`)

## Out-of-Scope / Boundaries
- No backend service
- No server-side persistence/database
- No CI/CD workflows in repo
- No automated test suites in repo
- No build tooling/package manager manifests detected

## Evidence Base
- Source scanned: `app.js`, `index.html`, `styles.css`, `README.md`, `.arcus/plans/PRD.md`
- Ignore rules: `.gitignore` (ignores `.arcus/`, `.krill/`, `.idea/`, `config.local.js`)
