/**
 * Platform capabilities — the single place that decides whether the app runs
 * inside the Capacitor Android shell or in a browser (PWA or tab).
 */
import { Capacitor } from '@capacitor/core';

/**
 * @param {{ isNativePlatform?: () => boolean }} [capacitor]  Injected for tests.
 * @returns {boolean} True only inside the native app.
 */
export function isNativePlatform(capacitor = Capacitor) {
  return capacitor?.isNativePlatform?.() === true;
}
