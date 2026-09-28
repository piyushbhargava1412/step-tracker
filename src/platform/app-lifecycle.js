/**
 * App lifecycle (ST-021): "the app came back to the foreground".
 *
 * In the Android app, Capacitor's `resume` event (Android keeps the app in
 * memory, so reopening it from Recents is a resume, not a fresh start). In
 * the browser, the page becoming visible again — a PWA tab left open all day
 * catches up when it is looked at.
 */
import { App } from '@capacitor/app';

/**
 * @param {{ isNative: boolean, doc: Document, app?: object }} deps  app: injected for tests.
 * @param {() => void} listener
 */
export function onAppResume({ isNative, doc, app = App }, listener) {
  if (isNative) {
    const fail = (err) => console.error('[app-lifecycle] resume listener failed', err);
    try {
      Promise.resolve(app.addListener('resume', listener)).catch(fail);
    } catch (err) {
      fail(err);
    }
    return;
  }
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible') listener();
  });
}
