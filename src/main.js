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
  const streak = createStreak(db)
  const streakUI = createStreakUI(doc, streak, reporter)
  const progressUI = createProgressUI(doc, goal, db, reporter, () => streakUI.render())
  const calendar = createCalendar(db, goal)
  const calendarUI = createCalendarUI(doc, db, calendar, reporter)

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
    })
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
}

// Register the bootstrap listener when running as the real app entry point.
// In tests, DOMContentLoaded is dispatched manually after mocks are configured.
if (typeof import.meta !== 'undefined' && import.meta.env?.MODE !== 'test') {
  document.addEventListener('DOMContentLoaded', () => bootstrap());
}
