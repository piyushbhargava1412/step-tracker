Here is the complete, consolidated **Product Requirements Document (PRD v1.0)** for your local PWA. It synthesizes all our architectural decisions, streak logic, search tools, spatial features, and data persistence strategies into a single blueprint.

---

# 📄 Product Requirements Document (PRD v1.0)

**Project Name:** Step Tracker / Impact-Style PWA

**Target Scope:** Phase 1 (Personal Local Web Application)

**Author:** Product & Architecture Team

---

## 1. Executive Summary & Core Principles

A hyper-focused, gamified step and distance dashboard built to hold users accountable to daily commitment targets, explore historical walking habits, and visualize progress through spatial maps and real-world milestones.

### Key Guiding Principles

* **Gamification Over Punishment:** Maintain daily streak motivation without invalidating long-term discipline.
* **Data Lineage:** Raw API payloads from Google Fit are never overwritten; manual edits exist as verified audit layers.
* **Backendless & Zero Latency:** Runs entirely client-side using browser memory/IndexedDB for sub-millisecond responsiveness.
* **Complete Ownership:** No third-party servers required; silent cloud backups are pushed directly to the user's private Google Drive.

---

## 2. Core Feature Set & Module Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                            HEALTH TRACKER PWA                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                               NAVIGATION TABS                                │
│   ┌───────────────┬───────────────┬───────────────┬───────────────┐          │
│   │ 🏠 Dashboard  │ 📅 Calendar   │ 🔍 Search Lab │ 🗺️ Spatial    │          │
│   │   & Streaks   │   & Overrides │   & Analytics │   Explorations│          │
│   └───────────────┴───────────────┴───────────────┴───────────────┘          │
└──────────────────────────────────────────────────────────────────────────────┘

```

---

### View 1: Command Center (Main Dashboard)

* **Active Streak Banner:** Prominently displays the current unbroken streak calculated via **Effective Date Lock** (combines continuous target achievements regardless of goal tier changes).
* **10k+ Step Achievement Counter:** Displays total lifetime days with $\ge 10,000$ steps alongside a lifetime consistency percentage (e.g., `312 / 500 Days — 62.4%`).
* **Today's Live Progress:**
* Real-time step counter and converted distance vs. today's active target.
* Visual progress bar with remaining steps/meters needed to extend the streak.


* **Goal-Tier Streak Row:** Dedicated mini-cards keeping track of active streaks across specific distance thresholds ($>1\text{ km}$, $>3\text{ km}$, $>5\text{ km}$, $>10\text{ km}$).
* **Macro Stats & Milestones:**
* **Commitment Rate Gauge:** Percentage of total days meeting targets over the evaluation window (e.g., `98.8% Lifetime`).
* **Delhi-to-London Milestone Bar:** Converts cumulative distance into real-world geographic journeys.



---

### View 2: Calendar & Data Audit

* **Monthly Performance Heatmap Grid:**
* Color-coded daily tiles indicating performance relative to daily targets (Missed, Met Goal, Exceeded Goal).
* **Override Badge (`*`):** Visually flags days that contain manual overrides.


* **Day Detail Drawer:** Sliding side panel triggered by selecting any calendar day:
* Compares **Synced Google Fit Data** vs. **Verified Manual Value**.
* Displays activity segment breakdown (Walking vs. Running vs. Treadmill).
* Proof viewer displaying user-uploaded screenshots and text notes.
* Form interface to input/edit step values, reasons, and proof artifacts.



---

### View 3: Milestones & Trophies

* **Pre-Calculated Distance Buckets:** Aggregated count and percentage breakdown across standard daily thresholds ($>1\text{ km}$, $>3\text{ km}$, $>5\text{ km}$, $>10\text{ km}$, $>20\text{ km}$).
* **Automated Trophy Badges:**
* 🏆 **Century Club:** Walked $>5\text{ km}$ on 100 total lifetime days.
* ⚡ **Titan Day:** Walked $>20\text{ km}$ in a single 24-hour period.
* 🛡️ **Iron Will:** Maintained a $>95\%$ commitment rate for 3 consecutive months.
* 🏔️ **Everest Climber:** Total vertical gain/steps equivalent to scaling Mt. Everest.



---

### View 4: Search Lab & Behavioral Analytics

* **Near-Miss Detector:** Pre-configured filter for days where actual performance reached 90–99% of the daily goal (identifies candidates for manual override or treadmill verification).
* **Side-by-Side Range Comparison Engine:** Select two custom date ranges (e.g., *June 2025 vs. June 2026*) to view percentage deltas for total distance, average daily steps, and target hit rates.
* **Day-of-Week Slump Finder:** Aggregated completion percentages grouped Monday through Sunday to identify structural habit trends and rest day patterns.
* **Custom Query Builder:** Flexible filter engine supporting logic constraints (`Steps > X`, `Distance < Y`, `Has Override Note`).
* **CSV / JSON Exporter:** One-click utility exporting filtered query results or full database tables to local desktop files.

---

### View 5: Spatial Explorations (Map)

* **Fog of War Explorer:** Interactive Leaflet map overlaid with a shroud that clears dynamically along GPS breadcrumbs synced from Samsung Watch / Google Fit location samples.
* **Farthest Point Out Pin:** Calculates maximum straight-line displacement from home base coordinates and pins the location on the map with a distance badge.
* **Route Time-Lapse Replay:** Animated mini-player for selected walking days that traces a moving marker along logged GPS coordinates over time.

---

## 3. Data Integrity & Persistence Engine

### Data Lineage Strategy

Raw synced data points from Google Fit are stored alongside user modifications without overwriting historical records.

```json
{
  "date": "2026-08-08",
  "synced_at": "2026-08-08T10:30:00Z",
  "original_steps": 6420,
  "original_distance_km": 4.85,
  "effective_steps": 6500,
  "effective_distance_km": 5.00,
  "is_overridden": true,
  "override": {
    "note": "Treadmill session logged manually.",
    "proof_image_base64": "data:image/png;base64,...",
    "updated_at": "2026-08-08T11:00:00Z"
  },
  "location_samples": []
}

```

### Storage Pipeline

1. **Local Primary Database:** IndexedDB managed via `Dexie.js` with `navigator.storage.persist()` enabled to prevent automatic browser disk eviction.
2. **Cloud Auto-Sync:** Integrated with Google Drive API (`[https://www.googleapis.com/auth/drive.appdata](https://www.googleapis.com/auth/drive.appdata)`).
* **Write Path:** Every sync or override event packages the database state into a `backup.json` snapshot uploaded silently to Google Drive's hidden `appDataFolder`.
* **Recovery Path:** On a new browser or machine, if local storage is empty, the PWA retrieves and restores the latest snapshot automatically from Google Drive.



---

## 4. Non-Goals (Scope Boundaries)

* **Phase 1 Non-Goals:** Heart rate tracking, calorie calculations, non-walking multi-sport tracking (swimming, cycling), manual GPS workout tracking on laptop.
* **Phase 2 Pipeline:** Social walking groups, multi-user public leaderboards, hosted server backends.

---
## 5. Updated ARCUS Backlog Roadmap
* ST-001.md: Core PWA Shell, Google OAuth Auth & Dexie.js Storage Initialization (Port 1981)
* ST-002.md: Google Fit Step Fetching & Sync Engine
* ST-003.md: Today's Live Progress & Goal Commitment UI
* ST-004.md: Effective Date Lock Streak & Goal-Tier Streaks Engine
* ST-005.md: Monthly Calendar Heatmap Grid & Day Detail Drawer
* ST-006.md: Data Audit Trail, Manual Overrides & Proof Uploads
* ST-007.md: Search Lab: Dynamic Query Engine & CSV Exporter
* ST-008.md: Search Lab: Behavioral Insights (Near-Miss & Day-of-Week Slumps)
* ST-009.md: Spatial Map: GPS Sample Fetching & Fog of War Overlay
* ST-010.md: Spatial Map: Route Time-Lapse Replay & Farthest Point Pin
* ST-011.md: Real-World Journeys (Delhi-to-London) & Automated Trophies
* ST-012.md: Silent Google Drive AppData Auto-Sync & Recovery
* ST-013.md: PWA Service Worker & Cloudflare Pages CI/CD Deployment