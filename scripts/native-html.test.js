import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { stripPwaTags, nativeHtmlPlugin } from './native-html.js';

const INDEX_HTML = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');

describe('ST-017: native build HTML transform', () => {
  it('removes the web app manifest link from the real index.html', () => {
    expect(INDEX_HTML).toContain('rel="manifest"');
    const html = stripPwaTags(INDEX_HTML);
    expect(html).not.toMatch(/rel="manifest"/);
  });

  it('keeps everything else — stylesheet, theme colour, app entry script', () => {
    const html = stripPwaTags(INDEX_HTML);
    expect(html).toContain('<link rel="stylesheet" href="styles.css" />');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('src="/src/main.js"');
  });

  it('removes Google\'s web sign-in script — it cannot work inside the app (ST-020)', () => {
    expect(INDEX_HTML).toContain('accounts.google.com/gsi/client');
    const html = stripPwaTags(INDEX_HTML);
    expect(html).not.toContain('accounts.google.com/gsi/client');
    expect(html).not.toContain('Google Identity Services Library');
  });

  it('is a no-op on HTML without a manifest link', () => {
    const html = '<head><title>x</title></head>';
    expect(stripPwaTags(html)).toBe(html);
  });

  it('exposes a Vite plugin that applies the transform to index.html', () => {
    const plugin = nativeHtmlPlugin();
    expect(plugin.name).toBe('step-tracker-native-html');
    expect(plugin.transformIndexHtml(INDEX_HTML)).toBe(stripPwaTags(INDEX_HTML));
  });
});

describe('ST-017: vite config modes', () => {
  it('adds the native HTML plugin only in native mode', async () => {
    const { default: configFn } = await import('../vite.config.js');
    const web = configFn({ mode: 'production', command: 'build' });
    const native = configFn({ mode: 'native', command: 'build' });
    const names = (cfg) => (cfg.plugins ?? []).filter(Boolean).map((p) => p.name);
    expect(names(web)).not.toContain('step-tracker-native-html');
    expect(names(native)).toContain('step-tracker-native-html');
    expect(web.server.port).toBe(1981);
  });
});
