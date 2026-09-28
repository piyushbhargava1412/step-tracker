/**
 * Share text with other apps — the Android share sheet in the app (Capacitor
 * Share), the Web Share API in a browser that has one. Browsers without it get
 * no share function, and callers then offer Copy only.
 */
import { Share } from '@capacitor/share';

/**
 * @param {{ isNative: boolean, plugin?: object, nav?: Navigator }} deps
 * @returns {((text: string) => Promise<void>) | null}
 */
export function selectShare({ isNative, plugin = Share, nav = globalThis.navigator }) {
  if (isNative) {
    return async (text) => {
      await plugin.share({ text });
    };
  }
  if (typeof nav?.share === 'function') {
    return (text) => nav.share({ text });
  }
  return null;
}
