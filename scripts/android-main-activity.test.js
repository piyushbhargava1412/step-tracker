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

const JAVA_DIR = path.resolve(__dirname, '../android/app/src/main/java/com/piyushbhargava/steptracker');
const readOptional = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '');
const DRIVE_PLUGIN = readOptional(path.join(JAVA_DIR, 'DriveAuthorizationPlugin.java'));
const APP_GRADLE = fs.readFileSync(path.resolve(__dirname, '../android/app/build.gradle'), 'utf-8');

describe('ST-026: DriveAuthorization native plugin', () => {
  it('is registered by MainActivity before the bridge starts', () => {
    expect(MAIN_ACTIVITY).toMatch(/registerPlugin\(DriveAuthorizationPlugin\.class\);(\s*registerPlugin\(\w+\.class\);)*\s*super\.onCreate\(/);
  });

  it('exposes "DriveAuthorization" with an authorize method', () => {
    expect(DRIVE_PLUGIN).toContain('@CapacitorPlugin(name = "DriveAuthorization")');
    expect(DRIVE_PLUGIN).toMatch(/@PluginMethod\s+public void authorize\(PluginCall call\)/);
  });

  it('uses the Play services Authorization API for the remembered account — not Credential Manager sign-in', () => {
    expect(DRIVE_PLUGIN).toContain('Identity.getAuthorizationClient(');
    expect(DRIVE_PLUGIN).toContain('setAccount(');
    expect(DRIVE_PLUGIN).not.toMatch(/CredentialManager|GetGoogleIdOption/);
  });

  it('never shows UI: a needed resolution is reported as NEEDS_CONSENT, not launched', () => {
    expect(DRIVE_PLUGIN).toContain('hasResolution()');
    expect(DRIVE_PLUGIN).toContain('"NEEDS_CONSENT"');
    expect(DRIVE_PLUGIN).not.toMatch(/startIntentSender|launch\(/);
  });

  it('the app depends on play-services-auth directly (the SocialLogin plugin keeps it private)', () => {
    expect(APP_GRADLE).toMatch(/implementation ['"]com\.google\.android\.gms:play-services-auth:\d/);
  });
});
