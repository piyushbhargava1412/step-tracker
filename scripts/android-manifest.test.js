import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Play Store review requires a justification for every Health Connect
 * permission an app declares. The health plugin's library manifest declares
 * read AND write access to ~25 data types, which Android's manifest merger
 * would otherwise pull into the app. The app manifest must strip every one it
 * does not use, and declare exactly the ones it does.
 */
const ROOT = path.resolve(__dirname, '..');
const APP_MANIFEST = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf-8');
const PLUGIN_MANIFEST = fs.readFileSync(
  path.join(ROOT, 'node_modules/@capgo/capacitor-health/android/src/main/AndroidManifest.xml'),
  'utf-8'
);

const USED_HEALTH_PERMISSIONS = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_DISTANCE',
  'android.permission.health.READ_HEALTH_DATA_HISTORY',
];

const healthPermissions = (xml) => [
  ...new Set(xml.match(/android\.permission\.health\.[A-Z0-9_]+/g) ?? []),
];

/** `<uses-permission android:name="X" …/>` elements, as { name, removed }. */
function usesPermissions(xml) {
  return [...xml.matchAll(/<uses-permission\b[^>]*>/g)].map(([tag]) => ({
    name: tag.match(/android:name="([^"]+)"/)[1],
    removed: /tools:node="remove"/.test(tag),
  }));
}

describe('ST-019: Android manifest health permissions', () => {
  const declared = usesPermissions(APP_MANIFEST);

  it('declares exactly the health permissions the app uses', () => {
    const kept = declared.filter((p) => !p.removed && p.name.includes('.health.')).map((p) => p.name);
    expect(kept.sort()).toEqual([...USED_HEALTH_PERMISSIONS].sort());
  });

  it('strips every other health permission the plugin declares', () => {
    const removed = new Set(declared.filter((p) => p.removed).map((p) => p.name));
    const unused = healthPermissions(PLUGIN_MANIFEST).filter((p) => !USED_HEALTH_PERMISSIONS.includes(p));
    expect(unused.length).toBeGreaterThan(0);
    for (const permission of unused) {
      expect(removed, permission).toContain(permission);
    }
  });

  it('declares the tools namespace the removals rely on', () => {
    expect(APP_MANIFEST).toContain('xmlns:tools="http://schemas.android.com/tools"');
  });

  it('never requests write access to health data', () => {
    const kept = declared.filter((p) => !p.removed).map((p) => p.name);
    expect(kept.some((p) => /health\.WRITE_/.test(p))).toBe(false);
  });
});
