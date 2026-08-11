import { describe, it, expect } from 'vitest';
import { KM_TO_STEPS } from './units.js';

describe('units', () => {
  it('exports KM_TO_STEPS with the exact expected value', () => {
    expect(KM_TO_STEPS).toBe(1312.33);
  });

  it('has no other named exports', async () => {
    const mod = await import('./units.js');
    expect(Object.keys(mod)).toEqual(['KM_TO_STEPS']);
  });
});
