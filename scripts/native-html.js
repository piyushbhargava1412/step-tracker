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
 * Google Identity Services (web sign-in). Google blocks it inside an app's
 * WebView; the app signs in natively instead (src/platform/native/google-auth.js).
 */
const GOOGLE_WEB_SIGN_IN = /\s*<!-- Google Identity Services Library -->\s*<script src="https:\/\/accounts\.google\.com\/gsi\/client"[^>]*><\/script>/;

/**
 * Remove web-only tags from index.html: the PWA manifest and Google's web sign-in script.
 *
 * @param {string} html
 * @returns {string}
 */
export function stripPwaTags(html) {
  return html.replace(MANIFEST_LINK, '').replace(GOOGLE_WEB_SIGN_IN, '');
}

/** Vite plugin applying stripPwaTags to index.html in `--mode native`. */
export function nativeHtmlPlugin() {
  return {
    name: 'step-tracker-native-html',
    transformIndexHtml: stripPwaTags,
  };
}
