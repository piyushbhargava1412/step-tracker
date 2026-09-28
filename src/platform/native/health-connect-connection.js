/**
 * Health Connect connection (Android app): the header Connect button asks
 * Health Connect for step access instead of signing in to Google.
 */
import { READ_TYPES } from '../../health-connect-step-source.js';

/** Connect button text in the Android app. */
export const HEALTH_CONNECT_CONNECT_LABEL = 'Connect Health Connect';

/** Health Connect's Play Store page — for phones where it is missing or outdated. */
export const HEALTH_CONNECT_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata';

const CONNECTED = '✅ Connected';

const stepsAllowed = (status) => (status?.readAuthorized ?? []).includes('steps');

/**
 * @param {{ health: object, reporter: object, launcher: object }} deps
 *   health: the @capgo/capacitor-health plugin; launcher: @capacitor/app-launcher.
 * @returns {import('../web/google-fit-connection.js').Connection}
 */
export function createHealthConnectConnection({ health, reporter, launcher }) {
  let listener = null;

  async function connected() {
    reporter.auth(CONNECTED);
    await listener?.();
  }

  return {
    label: HEALTH_CONNECT_CONNECT_LABEL,

    async connect() {
      try {
        const { available } = await health.isAvailable();
        if (!available) {
          reporter.auth('⚠️ Install or update Health Connect, then tap Connect again');
          await launcher.openUrl({ url: HEALTH_CONNECT_PLAY_STORE_URL });
          return;
        }
        // History access lifts Health Connect's 30-day read limit where the
        // phone supports it; it is skipped silently where it does not.
        const status = await health.requestAuthorization({ read: READ_TYPES, requestHistoryAccess: true });
        if (!stepsAllowed(status)) {
          reporter.auth('🔑 Step access not allowed — allow it in Health Connect');
          return;
        }
      } catch (err) {
        console.error('[health-connect]', err);
        reporter.auth('⚠️ Could not reach Health Connect');
        return;
      }
      await connected();
    },

    async restore() {
      try {
        const { available } = await health.isAvailable();
        if (!available) return;
        if (!stepsAllowed(await health.checkAuthorization({ read: READ_TYPES }))) return;
      } catch (err) {
        console.error('[health-connect] restore failed, continuing', err);
        return;
      }
      await connected();
    },

    onConnected(next) {
      listener = next;
    },
  };
}
