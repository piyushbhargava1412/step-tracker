/**
 * Native (Capacitor) build HTML transform.
 *
 * The Android app loads its web assets from the APK, so the PWA install
 * manifest has no meaning there. The service worker is kept out at runtime
 * instead (see main.js → createSwRegister), because a service worker inside
 * the app would serve stale files after an app update.
 */

const MANIFEST_LINK = /\s*<link rel="manifest"[^>]*>/;

/**
 * Remove PWA-only tags from index.html.
 *
 * @param {string} html
 * @returns {string}
 */
export function stripPwaTags(html) {
  return html.replace(MANIFEST_LINK, '');
}

/** Vite plugin applying stripPwaTags to index.html in `--mode native`. */
export function nativeHtmlPlugin() {
  return {
    name: 'step-tracker-native-html',
    transformIndexHtml: stripPwaTags,
  };
}
