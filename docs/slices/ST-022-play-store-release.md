Story ID: ST-022

# ST-022 — Play Store Release (Internal Testing)

## Context

Phase 3 of [health-connect-android-roadmap.md](../plans/health-connect-android-roadmap.md). Apps that read Health Connect data need Play Console review: a Health apps declaration, a privacy policy and a justification per permission. Review can take weeks, so this runs in parallel with ST-019–ST-021.

## Scope

* Privacy policy page (hosted on the Cloudflare Pages site): data read, stored only on device and in the user's own Drive `appDataFolder`, never sent elsewhere.
* Play Console: app listing, Health apps declaration form, permission justifications (steps, distance, history, background).
* Signed release AAB via documented steps in `docs/plans/android-release.md`; upload to the internal testing track.

## Out of Scope

* Production track rollout.

## Acceptance Criteria

* Health apps declaration approved.
* Internal-testing install from Play works on a physical device and passes the ST-019 acceptance checks.

## Implementation

* `public/privacy.html`, `docs/plans/android-release.md`.
