// main.js — composition root
// Wires all concrete modules together and bootstraps the application.

import { CLIENT_ID } from './config.js'
import { createStatusReporter } from './ui-status.js'
import { createDb, initDB } from './db.js'
import { requestPersistentStorage } from './storage.js'
import { createAuth } from './auth.js'
import { createStepSync } from './steps.js'
import { initTabs } from './tabs.js'
import { createGoal } from './goal.js'
import { createProgressUI } from './progress-ui.js'
import { createStreak } from './streak.js'
import { createStreakUI } from './streak-ui.js'
import { createCalendar } from './calendar.js'
import { createCalendarUI } from './calendar-ui.js'
import { createMonthOverview } from './month-overview.js'
import { createRecords } from './records.js'
import { processImage } from './image-processor.js'
import { createSearch, computeNearMisses } from './search.js'
import { createSearchUI } from './search-ui.js'
import { createExporter } from './exporter.js'
import { createChallenge } from './challenge.js'
import { createChallengeUI } from './challenge-ui.js'

const MS_PER_DAY = 86_400_000

/**
 * Render the header's "Sync: X days ago" label from the most recently synced
 * record. Fully fail-open: a missing element or store read leaves the label at
 * its placeholder text and never throws or rejects.
 *
 * @param {object} db  - Dexie database exposing `daily_records`.
 * @param {Document} doc - The DOM document (injected for testability).
 * @returns {Promise<void>}
 */
export async function _renderLastSyncLabel(db, doc = document) {
  const el = doc?.getElementById?.('last-sync')
  if (!el) return

  const latest = await db?.daily_records?.orderBy?.('date')?.last?.()
  if (!latest?.synced_at) return

  const elapsed = Date.now() - new Date(latest.synced_at).getTime()
  const days = Math.max(0, Math.round(elapsed / MS_PER_DAY))
  el.textContent =
    days === 0 ? 'Sync: just now' : `Sync: ${days} day${days === 1 ? '' : 's'} ago`
}

export async function bootstrap(doc = document) {
  // 1. Build shared reporter
  const reporter = createStatusReporter(doc)

  // 2. Config object — expose CLIENT_ID as a plain object for injection
  const config = { CLIENT_ID }

  // 3. Init DB (fail-open: catch so later steps still run)
  const db = createDb()
  try {
    await initDB(db, reporter)
  } catch (err) {
    console.error('[main] initDB failed, continuing', err)
  }

  // 4. Request persistent storage (fail-open)
  try {
    await requestPersistentStorage(reporter)
  } catch (err) {
    console.error('[main] requestPersistentStorage failed, continuing', err)
  }

  // 5. Auth
  const auth = createAuth(config, reporter)
  auth.init()

  // 6. Step sync engine
  const stepSync = createStepSync(auth, db, reporter, doc)

  // 6a. Goal + progress UI + streak engine (wired after db is ready)
  const goal = createGoal(db)
  const streak = createStreak(db, goal)
  const streakUI = createStreakUI(doc, streak, reporter)
  const calendar = createCalendar(db, goal)
  const records = createRecords(db)
  const monthOverview = createMonthOverview(doc, calendar, reporter)
  const search = createSearch(db)
  const exporter = createExporter(doc)
  const searchUI = createSearchUI(doc, search, exporter, reporter, computeNearMisses)
  const calendarUI = createCalendarUI(doc, db, calendar, reporter, records, processImage, monthOverview)
  const challenge = createChallenge(db)
  const challengeUI = createChallengeUI(doc, challenge, db, reporter)
  const progressUI = createProgressUI(doc, goal, db, reporter, async () => {
    try {
      await streakUI.render()
    } catch (err) {
      console.error('[main] streakUI.render failed after goal change, continuing', err)
    }
    try {
      await calendarUI.render()
    } catch (err) {
      console.error('[main] calendarUI.render failed after goal change, continuing', err)
    }
    try {
      await monthOverview.render()
    } catch (err) {
      console.error('[main] monthOverview.render failed after goal change, continuing', err)
    }
  })

  // 7. Bind auth button
  const authBtn = doc.getElementById('auth-btn')
  if (authBtn) {
    authBtn.addEventListener('click', () => auth.requestToken())
  }

  // 8. Bind sync button (SF-12: re-render after each sync click)
  const syncBtn = doc.getElementById('sync-btn')
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      await stepSync.sync()
      progressUI.render()
      try {
        await streakUI.render()
      } catch (err) {
        console.error('[main] streakUI.render failed after sync, continuing', err)
      }
      try {
        await calendarUI.render()
      } catch (err) {
        console.error('[main] calendarUI.render failed after sync, continuing', err)
      }
      try {
        await monthOverview.render()
      } catch (err) {
        console.error('[main] monthOverview.render failed after sync, continuing', err)
      }
      try {
        await challengeUI.render()
      } catch (err) {
        console.error('[main] challengeUI.render failed after sync, continuing', err)
      }
    })
  }

  // 8a. Register data:records:mutated listener for override recalculation (fail-open)
  doc.addEventListener('data:records:mutated', async () => {
    try {
      progressUI.render()
    } catch (err) {
      console.error('[main] progressUI.render failed after mutation, continuing', err)
    }
    try {
      await streakUI.render()
    } catch (err) {
      console.error('[main] streakUI.render failed after mutation, continuing', err)
    }
    try {
      await calendarUI.render()
    } catch (err) {
      console.error('[main] calendarUI.render failed after mutation, continuing', err)
    }
    try {
      await monthOverview.render()
    } catch (err) {
      console.error('[main] monthOverview.render failed after mutation, continuing', err)
    }
    try {
      await challengeUI.render()
    } catch (err) {
      console.error('[main] challengeUI.render failed after mutation, continuing', err)
    }
  })

  // 8b. Populate the header "Sync: …" label from the newest record (fail-open)
  try {
    await _renderLastSyncLabel(db, doc)
  } catch (err) {
    console.error('[main] last-sync label update failed, continuing', err)
  }

  // 9. Init tab navigation
  const tabBar = doc.querySelector('.tab-bar')
  if (tabBar) {
    initTabs(tabBar, doc)
  }

  // 10. Render Today's Progress card on page load (fail-open)
  try {
    await progressUI.render()
  } catch (err) {
    console.error('[main] progressUI.render failed, continuing', err)
  }

  // 11. Render streak card on page load (SF-10, fail-open)
  try {
    await streakUI.render()
  } catch (err) {
    console.error('[main] streakUI.render failed, continuing', err)
  }

  // 12. Render calendar on page load (SF-7, fail-open)
  try {
    await calendarUI.render()
  } catch (err) {
    console.error('[main] calendarUI.render failed, continuing', err)
  }

  // 13. Render current-month overview on page load (mockup dashboard, fail-open)
  try {
    await monthOverview.render()
  } catch (err) {
    console.error('[main] monthOverview.render failed, continuing', err)
  }

  // 14. Render search UI on page load (fail-open)
  try {
    await searchUI.render()
  } catch (err) {
    console.error('[main] searchUI.render failed, continuing', err)
  }

  // 15. Render challenge card on page load (fail-open)
  try {
    await challengeUI.render()
  } catch (err) {
    console.error('[main] challengeUI.render failed, continuing', err)
  }
}

// Register the bootstrap listener when running as the real app entry point.
// In tests, DOMContentLoaded is dispatched manually after mocks are configured.
if (typeof import.meta !== 'undefined' && import.meta.env?.MODE !== 'test') {
  document.addEventListener('DOMContentLoaded', () => bootstrap());
}
