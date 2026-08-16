import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const readRepoFile = (relativePath) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const swPath = '../public/sw.js';
const policyPath = 'sw-policy.js';

describe('PWA sanity spine', () => {
  let swSource;
  let policySource;

  beforeAll(() => {
    swSource = readRepoFile(swPath);
    policySource = readRepoFile(policyPath);
  });

  it('parses sw.js as valid classic-worker JavaScript', () => {
    expect(() => new Function(swSource)).not.toThrow();
  });

  it('declares a versioned cache name with the step-tracker-v prefix', () => {
    expect(swSource).toMatch(/SW_VERSION\s*=\s*'step-tracker-v\d+'/);
    expect(swSource).toContain('step-tracker-v');
  });

  it('precaches only the stable root files at install', () => {
    const precacheWindow = swSource.slice(swSource.indexOf('cache.addAll'), swSource.indexOf('cache.addAll') + 200);
    expect(precacheWindow).toContain("['/', '/index.html', '/styles.css', '/manifest.json']");
    expect(precacheWindow).not.toMatch(/index-\d|index-[a-z0-9]+\.js/);
  });

  it('never hardcodes hashed build asset names (SF-3 runtime-populate design)', () => {
    expect(swSource).not.toMatch(/index-\d|index-[a-z0-9]+\.js/);
  });

  it('deletes stale caches on activate (name !== SW_VERSION)', () => {
    expect(swSource).toContain('caches.delete');
    expect(swSource).toContain('!== SW_VERSION');
  });

  it('mirrors every src/sw-policy.js policy marker so the copy cannot drift', () => {
    const markers = ['googleapis.com', '/fitness/', '/drive/', 'accounts.google.com', '/gsi/'];
    for (const marker of markers) {
      expect(policySource).toContain(marker);
      expect(swSource).toContain(marker);
    }
    expect(swSource).toContain('mirrors src/sw-policy.js');
  });

  it('keeps the Network-Only REST bypass free of any cache access', () => {
    const fitnessGuard = swSource.indexOf("'/fitness/'");
    expect(fitnessGuard).toBeGreaterThan(-1);
    const firstCacheAccess = Math.min(
      ...['cache.match', 'cache.put'].map((token) => swSource.indexOf(token)).filter((i) => i !== -1)
    );
    expect(firstCacheAccess).toBeGreaterThan(fitnessGuard);
  });

  it('implements stale-while-revalidate for GSI with background refresh', () => {
    expect(swSource).toContain("'/gsi/'");
    expect(swSource).toContain('cache.match');
    expect(swSource).toContain('cache.put');
    expect(swSource).toContain('response.clone()');
  });

  it('includes both fitness AND drive bypass markers (ST-012 drive.appdata scope)', () => {
    expect(swSource).toContain('/fitness/');
    expect(swSource).toContain('/drive/');
  });

  it('fails open: fetch handler wrapped in try/catch with plain fetch fallback', () => {
    expect(swSource).toMatch(/catch\s*\{\s*return fetch\(request\)/);
    expect(swSource).toContain('respondWith(');
  });

  it('uses update-on-next-visit — no skipWaiting or clients.claim', () => {
    expect(swSource).not.toMatch(/skipWaiting|clients\.claim/);
  });
});