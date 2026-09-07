import { describe, it, expect } from 'vitest';
import { HOME_BASE_CITIES, MILESTONES, computeOdysseyProgress } from './odyssey.js';

// ── Static shape tests ────────────────────────────────────────────────────────

describe('HOME_BASE_CITIES', () => {
  it('has exactly 7 entries', () => {
    expect(HOME_BASE_CITIES).toHaveLength(7);
  });

  it('first entry is Hyderabad', () => {
    expect(HOME_BASE_CITIES[0].name).toBe('Hyderabad');
  });

  it('every entry has name, country, lat, lng', () => {
    for (const city of HOME_BASE_CITIES) {
      expect(city).toHaveProperty('name');
      expect(city).toHaveProperty('country');
      expect(city).toHaveProperty('lat');
      expect(city).toHaveProperty('lng');
    }
  });

  it('contains all 7 expected city names in order', () => {
    const names = HOME_BASE_CITIES.map(c => c.name);
    expect(names).toEqual([
      'Hyderabad', 'Goa', 'Mumbai', 'New Delhi', 'Dubai', 'London', 'New York',
    ]);
  });
});

describe('MILESTONES', () => {
  it('has exactly 6 entries', () => {
    expect(MILESTONES).toHaveLength(6);
  });

  it('cumulative distanceKm values match spec', () => {
    const distances = MILESTONES.map(m => m.distanceKm);
    expect(distances).toEqual([650, 710, 1580, 2890, 7700, 12500]);
  });

  it('destinations match spec in order', () => {
    const dests = MILESTONES.map(m => m.destination);
    expect(dests).toEqual(['Goa', 'Mumbai', 'New Delhi', 'Dubai', 'London', 'New York']);
  });

  it('every entry has destination and distanceKm', () => {
    for (const m of MILESTONES) {
      expect(m).toHaveProperty('destination');
      expect(m).toHaveProperty('distanceKm');
    }
  });
});

// ── computeOdysseyProgress ────────────────────────────────────────────────────

describe('computeOdysseyProgress', () => {
  describe('zero-state (0 km)', () => {
    it('returns 0 unlocked legs', () => {
      expect(computeOdysseyProgress(0).unlockedLegs).toHaveLength(0);
    });

    it('activeLeg is Goa (first milestone)', () => {
      expect(computeOdysseyProgress(0).activeLeg.destination).toBe('Goa');
    });

    it('progressPct is 0', () => {
      expect(computeOdysseyProgress(0).progressPct).toBe(0);
    });

    it('remainingKm equals Goa distanceKm (650)', () => {
      expect(computeOdysseyProgress(0).remainingKm).toBe(650);
    });
  });

  describe('exact Goa boundary (650 km)', () => {
    it('Goa is now unlocked (1 leg)', () => {
      expect(computeOdysseyProgress(650).unlockedLegs).toHaveLength(1);
    });

    it('activeLeg is Mumbai', () => {
      expect(computeOdysseyProgress(650).activeLeg.destination).toBe('Mumbai');
    });

    it('progressPct is 0 (just entered Mumbai leg)', () => {
      // previousLegKm=650, activeLeg.distanceKm=710 → (650-650)/(710-650)*100 = 0
      expect(computeOdysseyProgress(650).progressPct).toBe(0);
    });

    it('remainingKm is 60 (710 - 650)', () => {
      expect(computeOdysseyProgress(650).remainingKm).toBe(60);
    });
  });

  describe('intermediate progress (980 km — inside New Delhi leg)', () => {
    it('unlocked legs: Goa + Mumbai (2)', () => {
      expect(computeOdysseyProgress(980).unlockedLegs).toHaveLength(2);
    });

    it('activeLeg is New Delhi', () => {
      expect(computeOdysseyProgress(980).activeLeg.destination).toBe('New Delhi');
    });

    it('progressPct computed correctly: (980-710)/(1580-710)*100', () => {
      const expected = (980 - 710) / (1580 - 710) * 100;
      expect(computeOdysseyProgress(980).progressPct).toBeCloseTo(expected, 5);
    });

    it('remainingKm is 1580 - 980 = 600', () => {
      expect(computeOdysseyProgress(980).remainingKm).toBe(600);
    });
  });

  describe('partial progress mid-Goa leg (325 km)', () => {
    it('0 unlocked legs', () => {
      expect(computeOdysseyProgress(325).unlockedLegs).toHaveLength(0);
    });

    it('activeLeg is Goa', () => {
      expect(computeOdysseyProgress(325).activeLeg.destination).toBe('Goa');
    });

    it('progressPct is 50 (half of 650)', () => {
      // previousLegKm=0, activeLeg.distanceKm=650 → 325/650*100 = 50
      expect(computeOdysseyProgress(325).progressPct).toBeCloseTo(50, 5);
    });

    it('remainingKm is 325', () => {
      expect(computeOdysseyProgress(325).remainingKm).toBe(325);
    });
  });

  describe('all legs complete (12500 km)', () => {
    it('all 6 legs unlocked', () => {
      expect(computeOdysseyProgress(12500).unlockedLegs).toHaveLength(6);
    });

    it('activeLeg is undefined', () => {
      expect(computeOdysseyProgress(12500).activeLeg).toBeUndefined();
    });

    it('progressPct is 100', () => {
      expect(computeOdysseyProgress(12500).progressPct).toBe(100);
    });

    it('remainingKm is 0', () => {
      expect(computeOdysseyProgress(12500).remainingKm).toBe(0);
    });
  });

  describe('beyond final milestone (15000 km)', () => {
    it('progressPct is clamped to 100', () => {
      expect(computeOdysseyProgress(15000).progressPct).toBe(100);
    });

    it('remainingKm is 0', () => {
      expect(computeOdysseyProgress(15000).remainingKm).toBe(0);
    });
  });

  describe('guard clauses — invalid input returns zero-state without throwing', () => {
    it('negative input returns zero-state', () => {
      const result = computeOdysseyProgress(-1);
      expect(result.unlockedLegs).toHaveLength(0);
      expect(result.activeLeg.destination).toBe('Goa');
      expect(result.progressPct).toBe(0);
      expect(result.remainingKm).toBe(650);
    });

    it('Infinity returns zero-state', () => {
      const result = computeOdysseyProgress(Infinity);
      expect(result.unlockedLegs).toHaveLength(0);
      expect(result.activeLeg.destination).toBe('Goa');
      expect(result.progressPct).toBe(0);
      expect(result.remainingKm).toBe(650);
    });

    it('NaN returns zero-state', () => {
      const result = computeOdysseyProgress(NaN);
      expect(result.unlockedLegs).toHaveLength(0);
      expect(result.activeLeg.destination).toBe('Goa');
      expect(result.progressPct).toBe(0);
      expect(result.remainingKm).toBe(650);
    });

    it('-Infinity returns zero-state', () => {
      const result = computeOdysseyProgress(-Infinity);
      expect(result.unlockedLegs).toHaveLength(0);
      expect(result.activeLeg.destination).toBe('Goa');
      expect(result.progressPct).toBe(0);
      expect(result.remainingKm).toBe(650);
    });

    it('undefined returns zero-state', () => {
      const result = computeOdysseyProgress(undefined);
      expect(result.unlockedLegs).toHaveLength(0);
      expect(result.activeLeg.destination).toBe('Goa');
      expect(result.progressPct).toBe(0);
      expect(result.remainingKm).toBe(650);
    });
  });
});
