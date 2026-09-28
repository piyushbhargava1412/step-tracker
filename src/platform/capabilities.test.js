import { describe, it, expect } from 'vitest';
import { isNativePlatform } from './capabilities.js';

describe('ST-018: platform capabilities', () => {
  it('is true only when Capacitor reports a native platform', () => {
    expect(isNativePlatform({ isNativePlatform: () => true })).toBe(true);
    expect(isNativePlatform({ isNativePlatform: () => false })).toBe(false);
  });

  it('is false for a missing or malformed Capacitor object', () => {
    expect(isNativePlatform(null)).toBe(false);
    expect(isNativePlatform({})).toBe(false);
    expect(isNativePlatform({ isNativePlatform: () => 'yes' })).toBe(false);
  });

  it('is false in the jsdom test browser with the real Capacitor runtime', () => {
    expect(isNativePlatform()).toBe(false);
  });
});
