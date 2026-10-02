import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Walkaholic is the name people see — launcher, recent apps, install prompts,
 * GitHub Releases. The identifiers underneath stay "step-tracker": changing the
 * Android application id would install a separate app with empty storage, and
 * the in-app update check looks for the step-tracker-<version>.apk asset.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf-8');

const STRINGS = read('android/app/src/main/res/values/strings.xml');
const STYLES = read('android/app/src/main/res/values/styles.xml');
const CAPACITOR = JSON.parse(read('capacitor.config.json'));
const RELEASE_WORKFLOW = read('.github/workflows/release-android.yml');
const ICON = read('public/icons/icon.svg');

const string = (name) => STRINGS.match(new RegExp(`<string name="${name}">([^<]*)</string>`))?.[1];

describe('Walkaholic branding', () => {
  it('the Android app is called Walkaholic', () => {
    expect(string('app_name')).toBe('Walkaholic');
    expect(string('title_activity_main')).toBe('Walkaholic');
    expect(CAPACITOR.appName).toBe('Walkaholic');
  });

  it('GitHub Releases are titled Walkaholic', () => {
    expect(RELEASE_WORKFLOW).toContain('TITLE="Walkaholic v$VERSION (Android, pre-release)"');
    expect(RELEASE_WORKFLOW).toContain('TITLE="Walkaholic v$VERSION"');
    expect(RELEASE_WORKFLOW).not.toContain('Step Tracker');
  });

  it('keeps the identifiers installed apps and the update check depend on', () => {
    expect(CAPACITOR.appId).toBe('com.piyushbhargava.steptracker');
    expect(string('package_name')).toBe('com.piyushbhargava.steptracker');
    expect(RELEASE_WORKFLOW).toContain('APK="$RUNNER_TEMP/step-tracker-$VERSION.apk"');
  });

  it('the Android 12+ system splash shows the mark on the app background, not a white screen', () => {
    const launch = STYLES.match(/<style name="AppTheme\.NoActionBarLaunch"[^>]*>([\s\S]*?)<\/style>/)[1];
    expect(launch).toContain('<item name="windowSplashScreenBackground">@color/ic_launcher_background</item>');
    expect(read('android/app/src/main/res/values/ic_launcher_background.xml')).toContain('#020617');
  });

  describe('the mark (public/icons/icon.svg) — source of every icon', () => {
    it('is the streak ring around a flame on the app background', () => {
      expect(ICON).toContain('<rect width="512" height="512" fill="#020617"/>');
      expect(ICON).toContain('stroke="#38bdf8"');
      expect(ICON).toContain('fill="#f59e0b"');
    });

    it('npm run android:assets renders the PWA and Android icons from it', () => {
      const script = read('scripts/generate-android-assets.sh');
      expect(script).toContain('SRC="public/icons/icon.svg"');
      for (const out of ['public/icons/icon-192.png', 'public/icons/icon-512.png', 'ic_launcher_foreground.png', 'splash.png']) {
        expect(script, out).toContain(out);
      }
    });
  });
});
