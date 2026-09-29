# Health Connect & Android App Roadmap

> Status: in progress · ST-016–ST-021 and ST-025 merged; ST-026, ST-023 and ST-024 built (owner asked for them together, 2026-09-29, ahead of the Fit shutdown); ST-022 Play Store postponed by the owner · 2026-09-29
> Goal: keep step data flowing after the Google Fit REST API shuts down (end of 2026) by reading from
> **Health Connect** inside an **Android app** (Capacitor), without losing any stored history.
> Out of scope for now: iOS / HealthKit, wearables-only sources, Play Billing.

## Why the two goals are one project

Health Connect is an **on-device Android SDK**. It has no REST or web API, so a browser PWA can never
read it. Migrating to Health Connect *requires* the Android app. The order is:

1. make the data source swappable (web, no Android yet),
2. wrap the existing app in Capacitor,
3. plug Health Connect in as a second source,
4. retire Fit and turn the web URL into a viewer.

Everything downstream of `daily_records` (streaks, analytics, gamification, Odyssey, calendar, search,
Drive backup) is source-agnostic already. Only [steps.js](../../src/steps.js) and the `fitness.*`
scopes in [auth.js](../../src/auth.js) know about Fit.

## Guiding rules

1. **History is never re-fetched from Health Connect.** Fit-era rows (2018-01-01 onward) already live
   in IndexedDB and Drive; Health Connect only needs to supply days from cutover onward.
2. **One writer to Drive at a time.** Drive sync is whole-file, last-writer-wins. Once the app pushes,
   the PWA must stop auto-pushing (see ST-020).
3. **One codebase.** The web and Android builds come from the same Vite + ES module source.
4. **Sources are plug-ins.** New data sources are new modules implementing the `StepSource` port; the
   sync engine is not edited to add one (Open/Closed).

## Target architecture

```
          ┌──────────────── same Vite + ES module codebase ────────────────┐
          │  UI modules → daily_records (Dexie) ← sync engine ← StepSource │
          └────────────────────────────────────────────────────────────────┘
   Android app (Capacitor)                         Web (Cloudflare Pages)
   ─ StepSource = Health Connect                   ─ until Fit shutdown: StepSource = Google Fit
   ─ Dexie in app-private storage                  ─ after: read-only viewer of the Drive snapshot
   ─ pushes snapshots to Drive appDataFolder
```

## Slices

| Phase | Slice | Summary |
|-------|-------|---------|
| 1 | [ST-016](../slices/ST-016-step-source-port.md) | `StepSource` port; Fit moves behind it. No behavior change. |
| 2 | [ST-017](../slices/ST-017-capacitor-android-shell.md) | Capacitor Android shell, native build mode without service worker. |
| 2 | [ST-018](../slices/ST-018-platform-adapter-layer.md) | `src/platform/` adapters (capabilities, auth, files, storage) with web implementations. |
| 2 | [ST-019](../slices/ST-019-health-connect-step-source.md) | Health Connect `StepSource` on native; permissions; daily + hourly aggregation. |
| 3 | [ST-020](../slices/ST-020-native-google-sign-in-drive.md) | Native Google sign-in for Drive `appdata`; primary-device rule. |
| 3 | [ST-021](../slices/ST-021-background-sync.md) | Sync when the app returns to the foreground (re-scoped: closed-app background sync deferred until after ST-023). |
| 3 | [ST-022](../slices/ST-022-play-store-release.md) | Release keystore, privacy policy, Health apps declaration, internal testing track. |
| 3 | [ST-026](../slices/ST-026-silent-drive-auth.md) | Stay connected to Drive (Play services authorization, no sign-in sheet); app storage wording. |
| 4 | [ST-023](../slices/ST-023-read-only-web-viewer.md) | Web URL becomes a read-only viewer of the Drive snapshot. |
| 4 | [ST-024](../slices/ST-024-retire-google-fit.md) | Remove the Fit source and `fitness.*` scopes (done with ST-023, before the shutdown). |

## Deadlines

- **Before 2026-12-31:** ST-016 → ST-020 should be live so daily syncing continues without a gap. If
  it slips, nothing is lost: stored history stays put, and the next Health Connect sync fills recent
  days (Health Connect keeps ~30 days readable without the history permission).
- ST-021 → ST-024 have no external deadline.

## Open decisions

- **Google Health API** (`health.googleapis.com/v4`) is Fit REST's cloud successor. It could keep the
  web build syncing, but it serves Google/Fitbit-ecosystem data and may not include phone-only steps
  recorded in Health Connect by other apps. Parked; revisit only if a spike shows its numbers match
  Health Connect's for the same days.
- **Health Connect plugin**: decided — `@capgo/capacitor-health` (see ST-019 *As built*). Background
  reads for ST-021 still need checking against it.

## Reference

The same Capacitor path was already taken in `tuition-manager` (its slices 32–38). Reuse its lessons:
native build skips the service worker, Google sign-in must be native inside the WebView, Android and
web OAuth clients must share one Google Cloud project so `appDataFolder` is shared, and a keystore
loss makes the app un-updatable.
