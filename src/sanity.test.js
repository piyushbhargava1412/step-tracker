import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import config from '../vite.config.js';

const readRepoFile = (relativePath) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const resolvedConfig = typeof config === 'function' ? config() : config;

describe('toolchain sanity', () => {
  it('exposes jsdom document global', () => {
    expect(document).toBeDefined();
  });

  it('exposes jsdom window global', () => {
    expect(window).toBeDefined();
  });

  it('configures the vite dev server on port 1981', () => {
    expect(resolvedConfig.server.port).toBe(1981);
  });

  it('ignores .env.local in .gitignore', () => {
    expect(readRepoFile('../.gitignore')).toContain('.env.local');
  });

  it('ignores node_modules/ in .gitignore', () => {
    expect(readRepoFile('../.gitignore')).toContain('node_modules/');
  });

  it('ships an .env.example without a real client id', () => {
    const envExample = readRepoFile('../.env.example').trim();
    expect(envExample).toBe('VITE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID_HERE');
    expect(envExample).not.toMatch(/apps\.googleusercontent\.com/);
  });

  it('declares an ES module package', () => {
    const pkg = JSON.parse(readRepoFile('../package.json'));
    expect(pkg.type).toBe('module');
  });

  it('depends on dexie at ^4', () => {
    const pkg = JSON.parse(readRepoFile('../package.json'));
    expect(pkg.dependencies.dexie).toMatch(/^\^4/);
  });

  it('declares the vitest toolchain as devDependencies', () => {
    const pkg = JSON.parse(readRepoFile('../package.json'));
    for (const dep of ['vite', 'vitest', 'jsdom', '@vitest/coverage-v8']) {
      expect(pkg.devDependencies).toHaveProperty(dep);
    }
  });
});
