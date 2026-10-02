import { describe, it, expect, vi } from 'vitest';
import {
  RELEASES_URL,
  parseVersion,
  isNewerVersion,
  plainReleaseNotes,
  newestRelease,
  createUpdateChecker,
} from './app-update.js';

const apk = (version) => ({
  name: `step-tracker-${version}.apk`,
  browser_download_url: `https://github.com/piyushbhargava1412/step-tracker/releases/download/v${version}/step-tracker-${version}.apk`,
});
const release = (version, extra = {}) => ({
  tag_name: `v${version}`,
  body: `- Notes for ${version}\n`,
  draft: false,
  prerelease: true,
  assets: [apk(version)],
  ...extra,
});

describe('ST-028: version comparison', () => {
  it('parses dotted versions with an optional leading v', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion(' 0.4 ')).toEqual([0, 4]);
    expect(parseVersion('1.0.0-beta')).toBeNull();
    expect(parseVersion('')).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
  });

  it('compares numerically, padding missing parts with zero', () => {
    expect(isNewerVersion('v0.10.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('0.4.1', '0.4')).toBe(true);
    expect(isNewerVersion('0.4', '0.4.0')).toBe(false);
    expect(isNewerVersion('0.3.9', '0.4.0')).toBe(false);
  });

  it('never calls an unparseable version newer', () => {
    expect(isNewerVersion('nightly', '0.4.0')).toBe(false);
    expect(isNewerVersion('0.5.0', '')).toBe(false);
  });
});

describe('ST-028: plainReleaseNotes', () => {
  const BODY = [
    'A fix release. **Pre-release / trial build.**',
    '',
    "## What's new",
    '- **Longest streak is right.** It uses `your` goal.',
    '- Faster [sync](https://example.com/x).',
    '',
    '## Install or update',
    '1. Download **`step-tracker-0.4.0.apk`** below.',
    '',
    '## Verify the download',
    '- File SHA-256: `abc`',
  ].join('\n');

  it("keeps only the What's new section — install and verify steps mean nothing inside the app", () => {
    expect(plainReleaseNotes(BODY)).toBe('- Longest streak is right. It uses your goal.\n- Faster sync.');
  });

  it('without a What\'s new heading, keeps the whole body as plain text', () => {
    expect(plainReleaseNotes('## Fixes\r\n- **Bold** and _soft_ and `code`\n\n\n\nEnd')).toBe(
      'Fixes\n- Bold and soft and code\n\nEnd',
    );
  });

  it('leaves underscores inside words alone', () => {
    expect(plainReleaseNotes('- Renamed sync_anchor_date')).toBe('- Renamed sync_anchor_date');
  });

  it('copes with an empty or missing body', () => {
    expect(plainReleaseNotes('')).toBe('');
    expect(plainReleaseNotes(null)).toBe('');
  });
});

describe('ST-028: newestRelease', () => {
  it('picks the highest version, whatever order GitHub lists them in', () => {
    const picked = newestRelease([release('0.4.0'), release('0.10.0'), release('0.9.0')]);
    expect(picked).toEqual({
      version: '0.10.0',
      notes: '- Notes for 0.10.0',
      apkUrl: apk('0.10.0').browser_download_url,
    });
  });

  it('includes pre-releases (every Android build so far is one)', () => {
    expect(newestRelease([release('0.4.0', { prerelease: true })])?.version).toBe('0.4.0');
  });

  it('skips drafts, releases without an APK and tags that are not versions', () => {
    const picked = newestRelease([
      release('0.6.0', { draft: true }),
      release('0.5.0', { assets: [{ name: 'notes.txt', browser_download_url: 'https://github.com/x' }] }),
      release('0.4.5', { assets: [{ name: 'a.apk' }] }),
      { ...release('0.4.4'), tag_name: 'web-preview' },
      release('0.4.1'),
    ]);
    expect(picked?.version).toBe('0.4.1');
  });

  it('returns null for an empty or malformed list', () => {
    expect(newestRelease([])).toBeNull();
    expect(newestRelease(null)).toBeNull();
    expect(newestRelease({ message: 'Not Found' })).toBeNull();
  });

  it('treats a missing body as no notes', () => {
    expect(newestRelease([release('0.4.1', { body: null })])?.notes).toBe('');
  });
});

describe('ST-028: createUpdateChecker', () => {
  const respond = (body, { ok = true, status = 200 } = {}) =>
    vi.fn().mockResolvedValue({ ok, status, json: async () => body });

  it('asks GitHub for the repo releases with the JSON media type', async () => {
    const fetchFn = respond([]);
    await createUpdateChecker({ installedVersion: '0.4.0', fetchFn }).check();
    expect(fetchFn).toHaveBeenCalledWith(RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });
    expect(RELEASES_URL).toBe('https://api.github.com/repos/piyushbhargava1412/step-tracker/releases?per_page=20');
  });

  it('returns the newest release when it is newer than the installed version', async () => {
    const fetchFn = respond([release('0.4.0'), release('0.4.1')]);
    const update = await createUpdateChecker({ installedVersion: '0.4.0', fetchFn }).check();
    expect(update?.version).toBe('0.4.1');
  });

  it('returns null when the installed version is the newest (or ahead, as in a local build)', async () => {
    const fetchFn = respond([release('0.4.0')]);
    expect(await createUpdateChecker({ installedVersion: '0.4.0', fetchFn }).check()).toBeNull();
    expect(await createUpdateChecker({ installedVersion: '0.5.0', fetchFn }).check()).toBeNull();
  });

  it('throws on an HTTP error, naming the status', async () => {
    const fetchFn = respond({ message: 'rate limited' }, { ok: false, status: 403 });
    await expect(createUpdateChecker({ installedVersion: '0.4.0', fetchFn }).check()).rejects.toThrow('403');
  });

  it('fails fast without an installed version', () => {
    expect(() => createUpdateChecker({ installedVersion: '', fetchFn: respond([]) })).toThrow(/installed version/);
  });
});
