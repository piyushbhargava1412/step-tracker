/**
 * Drive authorization through Google Play services (ST-026) — the JS side of
 * the app-local DriveAuthorization plugin
 * (android/app/src/main/java/.../DriveAuthorizationPlugin.java).
 *
 * `authorize()` returns an access token for scopes the user already granted,
 * without a sign-in and without UI; Play services renews it when it expires.
 * It resolves to null — never throws — when there is no token: quietly when
 * Google needs the user again (NEEDS_CONSENT), logged for anything else.
 */
import { registerPlugin } from '@capacitor/core';

/** Rejection code: Google needs the user (consent or account) before it hands out a token. */
export const NEEDS_CONSENT = 'NEEDS_CONSENT';

/**
 * @param {{ authorize: (options: object) => Promise<{ accessToken?: string }> }} [plugin]
 *   The native plugin; registered on first use when not given (app only).
 * @returns {{ authorize: (options: { scopes: string[], account?: string|null }) => Promise<string|null> }}
 */
export function createDriveAuthorization(plugin) {
  let native = plugin;

  async function authorize({ scopes, account }) {
    native ??= registerPlugin('DriveAuthorization');
    try {
      const { accessToken } = await native.authorize(account ? { scopes, account } : { scopes });
      return accessToken || null;
    } catch (err) {
      if (err?.code !== NEEDS_CONSENT) console.error('[drive-authorization]', err);
      return null;
    }
  }

  return { authorize };
}
