/**
 * App update check (ST-028) — is there a newer Android build than the one installed?
 *
 * Releases are GitHub Releases on this (public) repo, each carrying a
 * `step-tracker-<version>.apk` asset, published by .github/workflows/release-android.yml.
 * Every Android build so far is marked pre-release, and GitHub's `/releases/latest`
 * ignores pre-releases, so this lists recent releases and picks the highest version.
 */

export const RELEASES_REPO = 'piyushbhargava1412/step-tracker';
export const RELEASES_URL = `https://api.github.com/repos/${RELEASES_REPO}/releases?per_page=20`;

/**
 * @typedef {{ version: string, notes: string, apkUrl: string }} AppUpdate
 */

/**
 * "v1.2.3" / "0.4" → [1, 2, 3] / [0, 4]; null if it isn't a plain dotted version.
 * @param {string} [raw]
 * @returns {number[] | null}
 */
export function parseVersion(raw) {
  const match = /^v?(\d+(?:\.\d+)*)$/.exec(String(raw ?? '').trim());
  return match ? match[1].split('.').map(Number) : null;
}

/**
 * True when `candidate` is strictly newer than `installed` ("0.4" equals "0.4.0").
 * An unparseable version on either side is never newer.
 */
export function isNewerVersion(candidate, installed) {
  return compareVersions(candidate, installed) > 0;
}

function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const WHATS_NEW_HEADING = /^#{1,6}\s*what['’]s new\s*$/i;
const HEADING = /^#{1,6}\s+/;

/**
 * Release notes as plain text for the app: only the "What's new" section when there is one (the
 * install and verify sections are for the GitHub page), with Markdown emphasis, code ticks, link
 * syntax and heading markers removed. The result is shown with textContent, never as HTML.
 * @param {string | null | undefined} body
 * @returns {string}
 */
export function plainReleaseNotes(body) {
  let lines = String(body ?? '').replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((line) => WHATS_NEW_HEADING.test(line.trim()));
  if (start !== -1) {
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => HEADING.test(line.trim()));
    lines = end === -1 ? rest : rest.slice(0, end);
  }
  return lines
    .map((line) => line
      .replace(HEADING, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|\*|`)(.+?)\1/g, '$2')
      .replace(/(?<!\w)(__|_)(.+?)\1(?!\w)/g, '$2')
      .replace(/`/g, '')
      .trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A GitHub release as an AppUpdate, or null when it isn't an installable build. */
function toUpdate(release) {
  if (!release || release.draft || !parseVersion(release.tag_name)) return null;
  const apk = release.assets?.find((asset) => asset?.name?.endsWith('.apk') && asset.browser_download_url);
  if (!apk) return null;
  return {
    version: release.tag_name.trim().replace(/^v/, ''),
    notes: plainReleaseNotes(release.body),
    apkUrl: apk.browser_download_url,
  };
}

/**
 * The highest-versioned installable release (pre-releases included), or null.
 * @param {unknown} releases  GitHub's `GET /repos/{repo}/releases` response.
 * @returns {AppUpdate | null}
 */
export function newestRelease(releases) {
  if (!Array.isArray(releases)) return null;
  let newest = null;
  for (const release of releases) {
    const update = toUpdate(release);
    if (update && (!newest || isNewerVersion(update.version, newest.version))) newest = update;
  }
  return newest;
}

/**
 * @param {{ installedVersion: string, fetchFn?: typeof fetch }} deps
 * @returns {{ check: () => Promise<AppUpdate | null> }}
 *   check() resolves to the newer release, or null when the installed version is the newest.
 *   It throws on a network or HTTP failure.
 */
export function createUpdateChecker({ installedVersion, fetchFn = globalThis.fetch?.bind(globalThis) }) {
  if (!parseVersion(installedVersion)) {
    throw new Error(`createUpdateChecker needs the installed version, got "${installedVersion}"`);
  }

  async function check() {
    const response = await fetchFn(RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Update check failed (${response.status})`);
    const newest = newestRelease(await response.json());
    return newest && isNewerVersion(newest.version, installedVersion) ? newest : null;
  }

  return { check };
}
