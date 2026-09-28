import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Google sign-in with extra scopes (drive.appdata) shows Google's consent as a
 * separate activity; the SocialLogin plugin refuses scoped logins unless
 * MainActivity forwards that result and carries the marker interface. Unit
 * tests mock the plugin, so only this guard catches a regression (found on a
 * device in ST-020: "You CANNOT use scopes without modifying the main activity").
 */
const MAIN_ACTIVITY = fs.readFileSync(
  path.resolve(__dirname, '../android/app/src/main/java/com/piyushbhargava/steptracker/MainActivity.java'),
  'utf-8'
);

describe('ST-020: MainActivity wiring for scoped Google sign-in', () => {
  it('implements the SocialLogin marker interface', () => {
    expect(MAIN_ACTIVITY).toMatch(/implements\s+ModifiedMainActivityForSocialLoginPlugin/);
    expect(MAIN_ACTIVITY).toContain('IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin');
  });

  it('forwards Google authorization results to the plugin', () => {
    expect(MAIN_ACTIVITY).toContain('REQUEST_AUTHORIZE_GOOGLE_MIN');
    expect(MAIN_ACTIVITY).toContain('handleGoogleLoginIntent(requestCode, data)');
  });
});
