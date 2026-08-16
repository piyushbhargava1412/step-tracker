import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const manifest = JSON.parse(readFileSync(path.resolve('public/manifest.json'), 'utf8'));

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const readIcon = (iconSrc) => readFileSync(path.resolve('public', iconSrc.replace(/^\//, '')));

const ihdrDimensions = (pngBuffer) => ({
  width: pngBuffer.readUInt32BE(16),
  height: pngBuffer.readUInt32BE(20),
});

describe('public/manifest.json', () => {
  describe('Happy Path', () => {
    it('matches the SF-9 identity: name "step-tracker" and short_name "Step Tracker"', () => {
      expect(manifest.name).toBe('step-tracker');
      expect(manifest.short_name).toBe('Step Tracker');
    });

    it('declares standalone display with start_url "/" and scope "/"', () => {
      expect(manifest.display).toBe('standalone');
      expect(manifest.start_url).toBe('/');
      expect(manifest.scope).toBe('/');
    });

    it('matches the SF-9 palette: background_color "#020617" and theme_color "#0ea5e9"', () => {
      expect(manifest.background_color).toBe('#020617');
      expect(manifest.theme_color).toBe('#0ea5e9');
    });

    it('declares exactly the 192x192 and 512x512 icon entries with type image/png', () => {
      expect(manifest.icons).toHaveLength(2);
      expect(manifest.icons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }),
          expect.objectContaining({ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }),
        ]),
      );
    });

    it('keeps start_url "/" within scope "/"', () => {
      expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
    });

    it('resolves every icon src path to an existing file on disk', () => {
      for (const icon of manifest.icons) {
        expect(() => readIcon(icon.src)).not.toThrow();
      }
    });

    it('starts both icon files with the PNG magic bytes', () => {
      for (const icon of manifest.icons) {
        const png = readIcon(icon.src);
        expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
      }
    });

    it('declares IHDR width/height (big-endian bytes 16-23) matching the manifest sizes', () => {
      for (const icon of manifest.icons) {
        const png = readIcon(icon.src);
        const { width, height } = ihdrDimensions(png);
        const [w, h] = icon.sizes.split('x').map(Number);
        expect(width).toBe(w);
        expect(height).toBe(h);
      }
    });
  });

  describe('Edge Cases', () => {
    it('contains no duplicate icon sizes and no icon missing sizes/type', () => {
      const sizes = manifest.icons.map((icon) => icon.sizes);
      expect(new Set(sizes).size).toBe(sizes.length);
      for (const icon of manifest.icons) {
        expect(icon.sizes).toBeTruthy();
        expect(icon.type).toBeTruthy();
      }
    });

    it('fails when a declared icon file is missing from disk (existence is a hard contract)', () => {
      for (const icon of manifest.icons) {
        expect(readFileSync(path.resolve('public', icon.src.replace(/^\//, ''))).length).toBeGreaterThan(0);
      }
    });
  });
});