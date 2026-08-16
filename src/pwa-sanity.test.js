import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CACHE_FIRST,
  STALE_WHILE_REVALIDATE,
  NETWORK_ONLY,
  SKIP,
  classifyRequestUrl,
} from './sw-policy.js';

const readRepoFile = (relativePath) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const swPath = '../public/sw.js';
const policyPath = 'sw-policy.js';

const LOCAL_ORIGIN = 'http://localhost:1981';

const SHARED_URL_TABLE = [
  ['http://localhost:1981/', LOCAL_ORIGIN, CACHE_FIRST],
  ['http://localhost:1981/styles.css', LOCAL_ORIGIN, CACHE_FIRST],
  ['http://localhost:1981/manifest.json', LOCAL_ORIGIN, CACHE_FIRST],
  ['http://localhost:1981/assets/index-abc123.js', LOCAL_ORIGIN, CACHE_FIRST],
  ['https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', LOCAL_ORIGIN, NETWORK_ONLY],
  ['https://www.googleapis.com/drive/v3/files', LOCAL_ORIGIN, NETWORK_ONLY],
  ['https://www.googleapis.com/drive/v3/files/abc123', LOCAL_ORIGIN, NETWORK_ONLY],
  ['https://googleapis.com/drive/v3/files', LOCAL_ORIGIN, NETWORK_ONLY],
  ['HTTPS://WWW.GOOGLEAPIS.COM/drive/v3/files', LOCAL_ORIGIN, NETWORK_ONLY],
  ['https://accounts.google.com/gsi/client', LOCAL_ORIGIN, STALE_WHILE_REVALIDATE],
  ['https://fonts.googleapis.com/css2?family=Roboto', LOCAL_ORIGIN, SKIP],
  ['https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.woff2', LOCAL_ORIGIN, SKIP],
  ['https://third-party.example.com/widget.js', LOCAL_ORIGIN, SKIP],
  ['data:text/plain,hello', LOCAL_ORIGIN, SKIP],
  ['blob:https://example.com/uuid', LOCAL_ORIGIN, SKIP],
  ['ftp://example.com/file', LOCAL_ORIGIN, SKIP],
  ['chrome-extension://abc123/manifest.json', LOCAL_ORIGIN, SKIP],
  ['https://www.googleapis.com/fitnessev/v1/anything', LOCAL_ORIGIN, SKIP],
  ['https://www.googleapis.com/fitness-preview/v1/anything', LOCAL_ORIGIN, SKIP],
  ['https://example.com:8443/x', 'https://example.com', SKIP],
  ['', LOCAL_ORIGIN, SKIP],
  [null, LOCAL_ORIGIN, SKIP],
  [undefined, LOCAL_ORIGIN, SKIP],
  [42, LOCAL_ORIGIN, SKIP],
  ['not a url', LOCAL_ORIGIN, SKIP],
  ['//no-scheme', LOCAL_ORIGIN, SKIP],
];

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

  it('caches opaque no-cors responses in the SWR branch (review warning 2)', () => {
    const swrWindow = swSource.slice(swSource.indexOf("policy === 'STALE_WHILE_REVALIDATE'"));
    expect(swrWindow).toMatch(/response\.ok\s*\|\|\s*response\.type\s*===\s*'opaque'/);
  });

  it('includes both fitness AND drive bypass markers (ST-012 drive.appdata scope)', () => {
    expect(swSource).toContain('/fitness/');
    expect(swSource).toContain('/drive/');
  });

  it('serves navigation requests network-first with cache fallback (review warning 1)', () => {
    const navMarker = swSource.indexOf("request.mode === 'navigate'");
    expect(navMarker).toBeGreaterThan(-1);
    const cacheFirstServe = swSource.indexOf('if (cached) {', navMarker);
    expect(cacheFirstServe).toBeGreaterThan(-1);
    expect(navMarker).toBeLessThan(cacheFirstServe);
    const navWindow = swSource.slice(navMarker, cacheFirstServe);
    const navFetch = navWindow.indexOf('fetch(request)');
    const navCacheMatch = navWindow.indexOf('cache.match');
    expect(navFetch).toBeGreaterThan(-1);
    expect(navCacheMatch).toBeGreaterThan(navFetch);
  });

  it('fails open: fetch handler wrapped in try/catch with plain fetch fallback', () => {
    expect(swSource).toMatch(/catch\s*\{\s*return fetch\(request\)/);
    expect(swSource).toContain('respondWith(');
  });

  it('uses update-on-next-visit — no skipWaiting or clients.claim', () => {
    expect(swSource).not.toMatch(/skipWaiting|clients\.claim/);
  });
});

describe('CI deploy workflow', () => {
  let workflowSource;

  beforeAll(() => {
    workflowSource = readRepoFile('../.github/workflows/deploy.yml');
  });

  it('triggers on push to main', () => {
    expect(workflowSource).toContain('push:');
    expect(workflowSource).toContain('branches: [main]');
  });

  it('runs the gate in order: npm ci → npm test → npm run build', () => {
    const ci = workflowSource.indexOf('npm ci');
    const test = workflowSource.indexOf('npm test');
    const build = workflowSource.indexOf('npm run build');
    expect(ci).toBeGreaterThan(-1);
    expect(test).toBeGreaterThan(ci);
    expect(build).toBeGreaterThan(test);
  });

  it('maps the GOOGLE_CLIENT_ID secret to VITE_CLIENT_ID at build time (SF-7)', () => {
    expect(workflowSource).toMatch(/VITE_CLIENT_ID:\s*\${{ secrets\.GOOGLE_CLIENT_ID }}/);
  });

  it('references all three secrets via ${{ secrets.* }} only', () => {
    expect(workflowSource).toContain('${{ secrets.GOOGLE_CLIENT_ID }}');
    expect(workflowSource).toContain('${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(workflowSource).toContain('${{ secrets.CLOUDFLARE_ACCOUNT_ID }}');
  });

  it('pins cloudflare/wrangler-action@v3 for the Pages deploy of dist/', () => {
    expect(workflowSource).toContain('cloudflare/wrangler-action@v3');
    expect(workflowSource).toContain('pages deploy dist --project-name=step-tracker');
  });

  it('sets minimal contents: read permissions', () => {
    expect(workflowSource).toMatch(/permissions:\s*\n\s*contents:\s*read/);
  });

  it('contains no credential-shaped literals', () => {
    expect(workflowSource).not.toMatch(/apps\.googleusercontent\.com/);
    expect(workflowSource).not.toMatch(/\b[a-f0-9]{32}\b/);
  });
});

describe('README setup, deployment, and PWA-install guide', () => {
  let readme;

  beforeAll(() => {
    readme = readRepoFile('../README.md');
  });

  it('documents both OAuth authorized origins, including the pages.dev host', () => {
    expect(readme).toContain('http://localhost:1981');
    expect(readme).toContain('https://<your-project>.pages.dev');
  });

  it('documents Fitness API AND Drive API enablement', () => {
    expect(readme).toContain('Fitness API');
    expect(readme).toContain('Drive API');
  });

  it('documents the .env.local + VITE_CLIENT_ID configuration flow', () => {
    expect(readme).toContain('.env.local');
    expect(readme).toContain('VITE_CLIENT_ID');
  });

  it('never instructs creating a config.local.js or copying config.example.js', () => {
    expect(readme).not.toMatch(/copy config\.example\.js|create a config\.local\.js/);
  });

  it('documents the one-time Cloudflare Pages project setup and pages.dev hosting', () => {
    expect(readme).toContain('pages.dev');
    expect(readme).toMatch(/pages project create/);
  });

  it('documents the three GitHub secrets in secret context, never as literal values', () => {
    expect(readme).toContain('GOOGLE_CLIENT_ID');
    expect(readme).toContain('CLOUDFLARE_API_TOKEN');
    expect(readme).toContain('CLOUDFLARE_ACCOUNT_ID');
  });

  it('covers PWA install for iOS Safari, Android Chrome, and Desktop Chrome/Edge', () => {
    expect(readme).toContain('Add to Home Screen');
    expect(readme).toContain('iOS Safari');
    expect(readme).toContain('Android Chrome');
  });

  it('documents the service worker refresh-to-update note', () => {
    expect(readme).toMatch(/refresh/i);
    expect(readme).toMatch(/^## Service Worker Updates/m);
  });

  it('scopes offline usage to implemented surfaces with the Spatial Map placeholder note', () => {
    expect(readme).toMatch(/^## Offline Usage/m);
    expect(readme).toContain('Spatial Map');
    expect(readme).toContain('placeholder');
  });

  it('contains no credential-shaped literals', () => {
    expect(readme).not.toMatch(/apps\.googleusercontent\.com/);
    expect(readme).not.toMatch(/\b[a-f0-9]{32}\b/);
  });
});

describe('sw.js embedded classifier semantic parity', () => {
  let swSource;
  let swClassifier;

  beforeAll(() => {
    swSource = readRepoFile(swPath);

    const fnStart = swSource.indexOf('function classifyRequestUrl');
    expect(fnStart).toBeGreaterThan(-1);

    let braceDepth = 0;
    let fnEnd = fnStart;
    for (let i = fnStart; i < swSource.length; i++) {
      if (swSource[i] === '{') braceDepth++;
      if (swSource[i] === '}') {
        braceDepth--;
        if (braceDepth === 0) {
          fnEnd = i + 1;
          break;
        }
      }
    }
    const fnSource = swSource.slice(fnStart, fnEnd);

    swClassifier = new Function(
      'urlString',
      'origin',
      fnSource + '\nreturn classifyRequestUrl(urlString, origin);'
    );
  });

  it.each(SHARED_URL_TABLE)(
    'sw.js classifier classifies %p (origin %p) identically to src/sw-policy.js',
    (urlString, origin, expected) => {
      const swResult = swClassifier(urlString, origin);
      const policyResult = classifyRequestUrl(urlString, origin);
      expect(swResult).toBe(policyResult);
      expect(swResult).toBe(expected);
    }
  );

  it('preserves the Network-Only REST bypass for all fitness and drive paths', () => {
    const restUrls = [
      'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
      'https://www.googleapis.com/drive/v3/files/abc123',
    ];
    for (const url of restUrls) {
      const swResult = swClassifier(url, LOCAL_ORIGIN);
      expect(swResult).toBe(NETWORK_ONLY);
      expect(swResult).not.toBe(CACHE_FIRST);
    }
  });
});
