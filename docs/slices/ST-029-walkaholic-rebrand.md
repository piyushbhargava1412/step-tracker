Story ID: ST-029

# ST-029 — Walkaholic Rebrand and Launch Splash

## Context

The app shipped as "Step Tracker" with a plain sky-blue staircase icon. The owner chose a brand —
**Walkaholic** — and, from four logo concepts, **D: the streak flame** (a flame inside an almost
closed progress ring: the streak and the daily goal in one mark). They also asked for a launch
splash: the streak ring filling, the flame burning, and "walk" sliding in from the left while
"aholic" slides in from the right. Then, seeing the separate first-launch welcome screen right
after it, they asked for one surface: the splash *is* the welcome — straight into the app when
there is nothing to set up, otherwise Connect / Not now at the bottom — keeping the welcome's
catchline, "Every step. Every streak."

## Scope

* **The mark** — `public/icons/icon.svg`: an 85% sky ring (`#38bdf8`) on a `#1e293b` track around
  an amber flame (`#f59e0b`, core `#fcd34d`), on the app background `#020617`, inside the
  adaptive-icon / maskable safe zone. It is the favicon and the source of every icon.
* **Icons** — `npm run android:assets` renders `public/icons/icon-192.png` / `icon-512.png`, the
  Android launcher icons (`ic_launcher`, `_round`, `_foreground`) and every `splash.png` from the
  mark with `rsvg-convert` (`brew install librsvg`), padding the splash with `sips`.
* **Name** — Walkaholic wherever people see it: Android `app_name` / `title_activity_main`,
  `capacitor.config.json` `appName`, the PWA manifest (`name`, `short_name`, `description`), the page
  title, Settings › App ("Walkaholic v<version>"), the welcome text, viewer notes and messages, the
  "Allow installs from Walkaholic" prompt, and GitHub Release titles.
* **Launch splash** — `#splash` in `index.html` (first element in `<body>`), animated in
  `styles.css`, driven by `src/splash.js`:
  * 150–1050ms the ring fills to 85%; 650–1100ms the flame pops in, then flickers;
    700–1300ms "walk" slides in from the left and "aholic" (amber) from the right;
    1100–1500ms the catchline "Every step. Every streak." rises in.
  * Once the app has rendered **and** `SPLASH_MIN_MS` (1700ms) has passed, it either fades into
    the app (350ms) or — on a first launch — holds (`hold()`) and grows the welcome panel from the
    bottom (the intro text, Connect, Restore from a backup in the app, Not now), lifting the mark.
    Closing the welcome fades into the app.
  * The web viewer's welcome reads "Your steps. Your Drive. Your wins — big and small, every one worth celebrating." (it was "See the steps your … app backs up
    to your Google Drive.").
  * The welcome shows under the same rule as before: no step data yet and never dismissed
    ("Not now" is remembered, so it does not ask on every launch).
  * Never stuck: it leaves by itself after `SPLASH_MAX_MS` (4000ms) if the app never reports ready
    (and comes back if the welcome is needed after all); a tap skips the rest of the animation.
  * The separate welcome screen (its rings, title and styles) is gone; `onboarding-ui.js` keeps
    the welcome's logic and gained `onClose`.
  * Reduced motion: no animation — the finished mark, gone as soon as the app is ready.
  * It plays on every launch (each page load). Resuming the app from the background does not
    reload the page, so it does not replay.
* **Subtle branding on the tabs** — the mark (ring + flame, 34px, static) sits left of the date
  and "Today" in the app bar on Today, and in the app bar's right corner on Calendar, Insights and
  Journey (one `.app-bar__mark`, moved with `order`); pushed screens show their back arrow instead. The Strict streak tile leads its number
  with the brand flame (`src/brand-mark.js` → `fillStatTile({ flame })`): **lit** amber while the
  streak is alive, **out** (grey) at 0 — the flame you keep burning.
* **Goal celebration** — when today's goal is met, a translucent brand flame drops from the top of
  the screen onto the step count, squashes as an amber glow blooms behind the number, then lifts
  and fades (2.8s, `src/goal-celebration.js` + `.goal-flame` in `styles.css`). Once per day (the
  date is kept in `localStorage.goal_celebrated_on`), and only when Today is actually on screen —
  if the goal is met behind the splash, the welcome or another tab, it waits for the splash to go
  or the next visit to Today. Reduced motion: it fades in place instead of falling. `progress-ui`
  reports a met goal through `onGoalMet`; the splash announces `splash:gone`.
* **Android launch screen** — `AppTheme.NoActionBarLaunch` sets `windowSplashScreenBackground` to
  `@color/ic_launcher_background` (#020617), so Android 12+ shows the launcher icon on the app
  background (not white) before the web splash takes over with the same mark.

## Kept as `step-tracker` (deliberately)

| Identifier | Why it stays |
|---|---|
| Application id `com.piyushbhargava.steptracker` | A new id installs a separate app with empty storage. |
| APK asset `step-tracker-<version>.apk` | Installed versions' update check looks for this name. |
| `step-tracker-backup-` / `step-tracker-export-` file prefixes | Existing backups and the Drive snapshot use them. |
| `Documents/Step Tracker/` export folder | Earlier backups and exports live there; a second folder would split them. |
| Repo, npm package, Cloudflare Pages project, service-worker cache prefix | Infrastructure names, not shown in the app. |

## Tests

* `src/splash.test.js` — dismiss and hold timing, hidden after the fade, reduced motion, dialog
  semantics while held, safety limit from page start (and lifted by hold), coming back after
  leaving, tap to skip, no markup → no-op.
* `src/index.test.js` — title, favicon, no "Step Tracker" left, splash markup, wordmark halves,
  catchline, the welcome inside the splash and no separate welcome screen.
* `src/styles.test.js` — splash overlay, fade-out, animations, resting state = finished mark,
  reduced motion.
* `src/main.test.js` — the splash holds for an open welcome, else leaves; closing the welcome lets it go.
* `src/onboarding-ui.test.js` — `onClose` after Not now / Restore / a connection, not when never open.
* `scripts/branding.test.js` — Android/Capacitor/Release names, kept identifiers, Android 12
  splash background, the mark and the asset script.
* `src/manifest.test.js` — manifest name, short name and description.
* `src/brand-mark.test.js` — the flame icon (size, proportions, lit/out) and one flame across
  `icon.svg`, the splash and the app bar mark.
* `src/stat-tile.test.js`, `src/streak-ui.test.js` — the tile flame; only Strict has it, lit vs out.
* `src/index.test.js`, `src/styles.test.js` — the app bar mark (tab screens) and the flame colours.
* `src/goal-celebration.test.js`, `src/progress-ui.test.js` (`onGoalMet`), `src/splash.test.js`
  (`splash:gone`), `src/main.test.js` (celebration wiring), `src/styles.test.js` (flame animation).
