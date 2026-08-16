import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CACHE_FIRST,
  STALE_WHILE_REVALIDATE,
  NETWORK_ONLY,
  SKIP,
  classifyRequestUrl,
} from './sw-policy.js';

const LOCAL_ORIGIN = 'http://localhost:1981';

describe('classifyRequestUrl', () => {
  describe('Happy Path', () => {
    it.each([
      ['http://localhost:1981/', 'http://localhost:1981', CACHE_FIRST],
      ['http://localhost:1981/styles.css', 'http://localhost:1981', CACHE_FIRST],
      ['http://localhost:1981/manifest.json', 'http://localhost:1981', CACHE_FIRST],
      ['http://localhost:1981/assets/index-abc123.js', 'http://localhost:1981', CACHE_FIRST],
    ])('classifies %s (origin %s) as %s', (urlString, origin, expected) => {
      expect(classifyRequestUrl(urlString, origin)).toBe(expected);
    });

    it('classifies a fitness aggregate REST call as NETWORK_ONLY', () => {
      expect(
        classifyRequestUrl(
          'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
          LOCAL_ORIGIN
        )
      ).toBe(NETWORK_ONLY);
    });

    it.each([
      'https://www.googleapis.com/drive/v3/files',
      'https://www.googleapis.com/drive/v3/files/abc123',
    ])('classifies Drive REST path %s as NETWORK_ONLY (ST-012 bypass)', (urlString) => {
      expect(classifyRequestUrl(urlString, LOCAL_ORIGIN)).toBe(NETWORK_ONLY);
    });

    it('classifies the GSI bootstrap script as STALE_WHILE_REVALIDATE', () => {
      expect(
        classifyRequestUrl('https://accounts.google.com/gsi/client', LOCAL_ORIGIN)
      ).toBe(STALE_WHILE_REVALIDATE);
    });

    it.each([
      'https://fonts.googleapis.com/css2?family=Roboto',
      'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.woff2',
      'https://third-party.example.com/widget.js',
    ])('classifies cross-origin %s as SKIP (uncached)', (urlString) => {
      expect(classifyRequestUrl(urlString, LOCAL_ORIGIN)).toBe(SKIP);
    });
  });

  describe('Edge Cases', () => {
    it.each([
      'https://www.googleapis.com/fitnessev/v1/anything',
      'https://www.googleapis.com/fitness-preview/v1/anything',
    ])('does NOT match the /fitness/ prefix for %s → SKIP', (urlString) => {
      expect(classifyRequestUrl(urlString, LOCAL_ORIGIN)).toBe(SKIP);
    });

    it('matches a non-www googleapis host by hostname for /drive/ → NETWORK_ONLY', () => {
      expect(classifyRequestUrl('https://googleapis.com/drive/v3/files', LOCAL_ORIGIN)).toBe(
        NETWORK_ONLY
      );
    });

    it('classifies an uppercase-host URL as NETWORK_ONLY (URL parsing normalises case)', () => {
      expect(
        classifyRequestUrl('HTTPS://WWW.GOOGLEAPIS.COM/drive/v3/files', LOCAL_ORIGIN)
      ).toBe(NETWORK_ONLY);
    });

    it('classifies same host on a different port as SKIP (exact origin comparison)', () => {
      expect(classifyRequestUrl('https://example.com:8443/x', 'https://example.com')).toBe(
        SKIP
      );
    });
  });

  describe('Guard Clauses', () => {
    it.each([
      'data:text/plain,hello',
      'blob:https://example.com/uuid',
      'ftp://example.com/file',
      'chrome-extension://abc123/manifest.json',
    ])('never classifies non-http(s) scheme %s → SKIP', (urlString) => {
      expect(classifyRequestUrl(urlString, LOCAL_ORIGIN)).toBe(SKIP);
    });

    it('returns SKIP for an empty string', () => {
      expect(classifyRequestUrl('', LOCAL_ORIGIN)).toBe(SKIP);
    });

    it.each([null, undefined, 42, { url: 'http://localhost:1981/' }])(
      'returns SKIP for non-string input %p',
      (input) => {
        expect(classifyRequestUrl(input, LOCAL_ORIGIN)).toBe(SKIP);
      }
    );

    it.each([null, undefined, 1981])(
      'returns SKIP when the origin parameter is non-string %p (guard path)',
      (origin) => {
        expect(classifyRequestUrl('http://localhost:1981/index.html', origin)).toBe(SKIP);
      }
    );

    it.each(['not a url', '//no-scheme'])(
      'fails open on malformed URL string %s → SKIP (no throw)',
      (urlString) => {
        expect(() => classifyRequestUrl(urlString, LOCAL_ORIGIN)).not.toThrow();
        expect(classifyRequestUrl(urlString, LOCAL_ORIGIN)).toBe(SKIP);
      }
    );
  });

  describe('Module Shape', () => {
    it('exports UPPER_SNAKE_CASE constants that are mutually distinct', () => {
      const buckets = [CACHE_FIRST, STALE_WHILE_REVALIDATE, NETWORK_ONLY, SKIP];
      expect(buckets).toHaveLength(new Set(buckets).size);
      buckets.forEach((bucket) => {
        expect(bucket).toEqual(expect.any(String));
        expect(bucket).toMatch(/^[A-Z_]+$/);
      });
    });

    it('contains no navigator, document, caches, or fetch references (pure classifier)', () => {
      const source = readFileSync(path.resolve('src/sw-policy.js'), 'utf8');
      expect(source).not.toMatch(/navigator/);
      expect(source).not.toMatch(/document/);
      expect(source).not.toMatch(/caches/);
      expect(source).not.toMatch(/fetch/);
    });
  });
});