import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * ST-028 release management. The native plugin, the Gradle version wiring and
 * the release workflow can't run under Vitest, so these guards pin the
 * contracts the app's update check relies on.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), 'utf-8') : '');

const JAVA_DIR = 'android/app/src/main/java/com/piyushbhargava/steptracker';
const MAIN_ACTIVITY = read(`${JAVA_DIR}/MainActivity.java`);
const APK_PLUGIN = read(`${JAVA_DIR}/ApkUpdaterPlugin.java`);
const MANIFEST = read('android/app/src/main/AndroidManifest.xml');
const FILE_PATHS = read('android/app/src/main/res/xml/file_paths.xml');
const APP_GRADLE = read('android/app/build.gradle');
const WORKFLOW = read('.github/workflows/release-android.yml');
const TAGGER = read('.github/workflows/tag-release.yml');
const PKG = JSON.parse(read('package.json'));

describe('ST-028: ApkUpdater native plugin', () => {
  it('is registered by MainActivity before the bridge starts', () => {
    expect(MAIN_ACTIVITY).toMatch(/registerPlugin\(ApkUpdaterPlugin\.class\);[\s\S]*super\.onCreate\(/);
  });

  it('exposes "ApkUpdater" with a downloadAndInstall method', () => {
    expect(APK_PLUGIN).toContain('@CapacitorPlugin(name = "ApkUpdater")');
    expect(APK_PLUGIN).toMatch(/@PluginMethod\s+public void downloadAndInstall\(PluginCall call\)/);
  });

  it('only downloads https links on github.com', () => {
    expect(APK_PLUGIN).toContain('"https".equals(');
    expect(APK_PLUGIN).toContain('host.equals("github.com")');
  });

  it('asks for the "Install unknown apps" switch with the INSTALL_PERMISSION code the JS side expects', () => {
    expect(APK_PLUGIN).toContain('canRequestPackageInstalls()');
    expect(APK_PLUGIN).toContain('"INSTALL_PERMISSION"');
  });

  it('hands the APK to the installer through the app FileProvider, from the cache folder', () => {
    expect(APK_PLUGIN).toContain('getCacheDir()');
    expect(APK_PLUGIN).toContain('".fileprovider"');
    expect(FILE_PATHS).toMatch(/<cache-path [^>]*path="\."/);
  });

  it('the manifest declares REQUEST_INSTALL_PACKAGES', () => {
    expect(MANIFEST).toContain('android.permission.REQUEST_INSTALL_PACKAGES');
  });
});

describe('ST-028: package.json is the single source of the app version', () => {
  it('Gradle reads versionName from package.json — no hard-coded version', () => {
    expect(APP_GRADLE).toContain("rootProject.file('../package.json')");
    expect(APP_GRADLE).toMatch(/versionName\s+appVersion\b/);
    expect(APP_GRADLE).toMatch(/versionCode\s+appVersionCode\b/);
    expect(APP_GRADLE).not.toMatch(/versionName\s+"/);
    expect(APP_GRADLE).not.toMatch(/versionCode\s+\d/);
  });

  it('versionCode = major×10000 + minor×100 + patch, which stays above the last hand-set code (6)', () => {
    expect(APP_GRADLE).toMatch(/major \* 10000 \+ minor \* 100 \+ patch/);
    const [major, minor, patch] = PKG.version.split('.').map(Number);
    expect(major * 10000 + minor * 100 + patch).toBeGreaterThan(6);
  });

  it('package.json carries a plain x.y.z version', () => {
    expect(PKG.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('ST-028: release workflow', () => {
  it('runs on v* tags, or when dispatched on a tag by the tagger, and can publish with the built-in token', () => {
    expect(WORKFLOW).toMatch(/tags:\s*\[\s*'v\*'\s*\]/);
    expect(WORKFLOW).toMatch(/^\s*workflow_dispatch:/m);
    expect(WORKFLOW).toMatch(/permissions:\s*\n\s*contents:\s*write/);
  });

  it('refuses a tag that does not match package.json', () => {
    expect(WORKFLOW).toContain('require("./package.json").version');
    expect(WORKFLOW).toMatch(/does not match package\.json/);
  });

  it('is test-gated and refuses to publish an unsigned APK', () => {
    expect(WORKFLOW).toContain('npm test');
    expect(WORKFLOW).toContain('apksigner');
  });

  it('attaches step-tracker-<version>.apk, the asset the update check looks for', () => {
    expect(WORKFLOW).toContain('APK="$RUNNER_TEMP/step-tracker-$VERSION.apk"');
    expect(WORKFLOW).toContain('gh release create "$TAG" "${{ steps.apk.outputs.path }}"');
  });
});

describe('ST-028: the version bump ships with the branch; merging it to main releases', () => {
  it('npm run release bumps package.json without committing or tagging', () => {
    expect(PKG.scripts.release).toBe('npm version --no-git-tag-version');
  });

  it('tag-release runs on pushes to main that touch package.json', () => {
    expect(TAGGER).toMatch(/branches:\s*\[\s*main\s*\]/);
    expect(TAGGER).toMatch(/paths:\s*\[\s*package\.json\s*\]/);
    expect(TAGGER).toMatch(/permissions:\s*\n\s*contents:\s*write\s*\n\s*actions:\s*write/);
  });

  it('does nothing when the tag already exists, and refuses a version below the latest tag', () => {
    expect(TAGGER).toContain('git rev-parse -q --verify "refs/tags/$TAG"');
    expect(TAGGER).toMatch(/is lower than the latest tag/);
  });

  it('tags the merged commit with a lightweight tag (an unsigned annotated tag shows "Unverified") and dispatches the release', () => {
    expect(TAGGER).toContain('git tag "$TAG" "$GITHUB_SHA"');
    expect(TAGGER).not.toMatch(/git tag (-a|--annotate|-m)/);
    expect(TAGGER).toContain('git push origin "$TAG"');
    expect(TAGGER).toContain('gh workflow run release-android.yml --ref "$TAG"');
  });
});
