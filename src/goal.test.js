import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createGoal,
  GOAL_PRESETS_KM,
  DEFAULT_GOAL_KM,
  DEFAULT_GOAL_STEPS,
  ACTIVE_GOAL_KEY,
  STEP_GOAL_OPTIONS,
  DEFAULT_STEP_GOAL,
  ACTIVE_STEP_GOAL_KEY,
} from './goal.js';
import { KM_TO_STEPS } from './units.js';
import { _localDate } from './date-utils.js';

describe('constants', () => {
  it('GOAL_PRESETS_KM = [1, 3, 5, 10]', () => {
    expect(GOAL_PRESETS_KM).toEqual([1, 3, 5, 10]);
  });

  it('DEFAULT_GOAL_KM = 3.0', () => {
    expect(DEFAULT_GOAL_KM).toBe(3.0);
  });

  it('KM_TO_STEPS = 1312.33', () => {
    expect(KM_TO_STEPS).toBe(1312.33);
  });

  it('DEFAULT_GOAL_STEPS = 3937', () => {
    expect(DEFAULT_GOAL_STEPS).toBe(3937);
  });

  it('ACTIVE_GOAL_KEY = "active_goal"', () => {
    expect(ACTIVE_GOAL_KEY).toBe('active_goal');
  });
});

describe('createGoal', () => {
  let mockDb;
  let mockGet;
  let mockPut;

  let mockHistoryPut;

  beforeEach(() => {
    mockGet = vi.fn();
    mockPut = vi.fn().mockResolvedValue(undefined);
    mockHistoryPut = vi.fn().mockResolvedValue(undefined);
    mockDb = {
      settings: {
        get: mockGet,
        put: mockPut,
      },
      goal_history: {
        put: mockHistoryPut,
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- getActiveGoal ----

  describe('getActiveGoal', () => {
    it('no stored row: writes default 3.0 km / 3937 steps and returns it', async () => {
      mockGet.mockResolvedValue(undefined);
      const goal = createGoal(mockDb);
      const result = await goal.getActiveGoal();

      expect(mockPut).toHaveBeenCalledTimes(1);
      const putArg = mockPut.mock.calls[0][0];
      expect(putArg.key).toBe('active_goal');
      expect(putArg.target_distance_km).toBe(3.0);
      expect(putArg.target_steps).toBe(3937);
      expect(putArg.effective_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      expect(mockHistoryPut).toHaveBeenCalledWith({
        effective_from: putArg.effective_from,
        target_distance_km: 3.0,
        target_steps: 3937,
      });

      expect(result.target_distance_km).toBe(3.0);
      expect(result.target_steps).toBe(3937);
      expect(result.key).toBe('active_goal');
      expect(result.effective_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('existing valid row: returns it without writing', async () => {
      const stored = {
        key: 'active_goal',
        target_distance_km: 5.0,
        target_steps: 6562,
        effective_from: '2026-08-01',
      };
      mockGet.mockResolvedValue(stored);
      const goal = createGoal(mockDb);
      const result = await goal.getActiveGoal();

      expect(mockPut).not.toHaveBeenCalled();
      expect(result).toEqual(stored);
    });

    it('corrupt row (target_distance_km is null): re-inits default', async () => {
      mockGet.mockResolvedValue({ key: 'active_goal', target_distance_km: null, target_steps: 3937, effective_from: '2026-08-01' });
      const goal = createGoal(mockDb);
      const result = await goal.getActiveGoal();

      expect(mockPut).toHaveBeenCalledTimes(1);
      expect(result.target_distance_km).toBe(3.0);
      expect(result.target_steps).toBe(3937);
    });

    it('corrupt row (target_distance_km is NaN): re-inits default', async () => {
      mockGet.mockResolvedValue({ key: 'active_goal', target_distance_km: NaN, target_steps: 3937, effective_from: '2026-08-01' });
      const goal = createGoal(mockDb);
      const result = await goal.getActiveGoal();

      expect(mockPut).toHaveBeenCalledTimes(1);
      expect(result.target_distance_km).toBe(3.0);
    });

    it('corrupt row (target_steps <= 0): re-inits default', async () => {
      mockGet.mockResolvedValue({ key: 'active_goal', target_distance_km: 3.0, target_steps: 0, effective_from: '2026-08-01' });
      const goal = createGoal(mockDb);
      const result = await goal.getActiveGoal();

      expect(mockPut).toHaveBeenCalledTimes(1);
      expect(result.target_steps).toBe(3937);
    });

    it('corrupt row (target_steps non-finite negative): re-inits default', async () => {
      mockGet.mockResolvedValue({ key: 'active_goal', target_distance_km: 3.0, target_steps: -1, effective_from: '2026-08-01' });
      const goal = createGoal(mockDb);
      const result = await goal.getActiveGoal();

      expect(mockPut).toHaveBeenCalledTimes(1);
      expect(result.target_steps).toBe(3937);
    });

    it('corrupt row (not an object): re-inits default', async () => {
      mockGet.mockResolvedValue('invalid');
      const goal = createGoal(mockDb);
      const result = await goal.getActiveGoal();

      expect(mockPut).toHaveBeenCalledTimes(1);
      expect(result.target_distance_km).toBe(3.0);
    });

    it('db.settings.get rejects: logs console.error("[goal]", err), returns default without writing', async () => {
      const err = new Error('DB read failed');
      mockGet.mockRejectedValue(err);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const goal = createGoal(mockDb);
      const result = await goal.getActiveGoal();

      expect(consoleSpy).toHaveBeenCalledWith('[goal]', err);
      expect(mockPut).not.toHaveBeenCalled();
      expect(result.target_distance_km).toBe(3.0);
      expect(result.target_steps).toBe(3937);
      expect(result.key).toBe('active_goal');
      // Must not throw
    });

    it('init-write (settings.put) rejects: logs error, still returns default', async () => {
      mockGet.mockResolvedValue(undefined);
      const err = new Error('DB write failed');
      mockPut.mockRejectedValue(err);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const goal = createGoal(mockDb);
      const result = await goal.getActiveGoal();

      expect(consoleSpy).toHaveBeenCalledWith('[goal]', err);
      expect(result.target_distance_km).toBe(3.0);
      expect(result.target_steps).toBe(3937);
    });
  });

  // ---- setActiveGoal ----

  describe('setActiveGoal', () => {
    it.each([
      { km: 1,  expectedSteps: 1312  },
      { km: 3,  expectedSteps: 3937  },
      { km: 5,  expectedSteps: 6562  },
      { km: 10, expectedSteps: 13123 },
    ])('$km km → persisted row has key=active_goal, target_steps=$expectedSteps', async ({ km, expectedSteps }) => {
      const goal = createGoal(mockDb);
      await goal.setActiveGoal(km);
      expect(mockPut).toHaveBeenCalledTimes(1);
      const arg = mockPut.mock.calls[0][0];
      expect(arg.key).toBe('active_goal');
      expect(arg.target_distance_km).toBe(km);
      expect(arg.target_steps).toBe(expectedSteps);
      expect(arg.effective_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('4.5 km → target_steps = 5905, effective_from refreshed to today', async () => {
      const goal = createGoal(mockDb);
      await goal.setActiveGoal(4.5);
      const arg = mockPut.mock.calls[0][0];
      expect(arg.target_steps).toBe(5905);
      expect(arg.target_distance_km).toBe(4.5);
      const today = _localDate(Date.now());
      expect(arg.effective_from).toBe(today);
    });

    it('0 km → throws TypeError, no DB write', async () => {
      const goal = createGoal(mockDb);
      await expect(goal.setActiveGoal(0)).rejects.toThrow(TypeError);
      expect(mockPut).not.toHaveBeenCalled();
    });

    it('-1 km → throws TypeError', async () => {
      const goal = createGoal(mockDb);
      await expect(goal.setActiveGoal(-1)).rejects.toThrow(TypeError);
    });

    it('NaN → throws TypeError', async () => {
      const goal = createGoal(mockDb);
      await expect(goal.setActiveGoal(NaN)).rejects.toThrow(TypeError);
    });

    it('Infinity → throws TypeError', async () => {
      const goal = createGoal(mockDb);
      await expect(goal.setActiveGoal(Infinity)).rejects.toThrow(TypeError);
    });

    it('"3" (string) → throws TypeError', async () => {
      const goal = createGoal(mockDb);
      await expect(goal.setActiveGoal('3')).rejects.toThrow(TypeError);
    });

    it('settings.put rejects → logs error, does not rethrow', async () => {
      const err = new Error('Write failed');
      mockPut.mockRejectedValue(err);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const goal = createGoal(mockDb);
      // Should resolve (not reject)
      await expect(goal.setActiveGoal(3)).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith('[goal]', err);
    });

    it.each([
      { km: 1,  expectedSteps: 1312  },
      { km: 3,  expectedSteps: 3937  },
      { km: 5,  expectedSteps: 6562  },
      { km: 10, expectedSteps: 13123 },
    ])('$km km → goal_history.put called once with exact row shape', async ({ km, expectedSteps }) => {
      const goal = createGoal(mockDb);
      await goal.setActiveGoal(km);
      expect(mockHistoryPut).toHaveBeenCalledTimes(1);
      const arg = mockHistoryPut.mock.calls[0][0];
      expect(arg.target_distance_km).toBe(km);
      expect(arg.target_steps).toBe(expectedSteps);
      expect(arg.effective_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('goal_history.put rejects → resolves without throwing, settings.put still called', async () => {
      const err = new Error('history write failed');
      mockHistoryPut.mockRejectedValue(err);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const goal = createGoal(mockDb);
      await expect(goal.setActiveGoal(3)).resolves.toBeUndefined();
      expect(mockPut).toHaveBeenCalledTimes(1);
    });

    it('db without goal_history → setActiveGoal writes settings only, no throw', async () => {
      const dbWithoutHistory = { settings: { get: vi.fn(), put: vi.fn().mockResolvedValue(undefined) } };
      const goal = createGoal(dbWithoutHistory);
      await expect(goal.setActiveGoal(3)).resolves.toBeUndefined();
      expect(dbWithoutHistory.settings.put).toHaveBeenCalledTimes(1);
    });
  });
});
describe('constants (step-goal)', () => {
  it('STEP_GOAL_OPTIONS = [5000, 7500, 10000, 15000]', () => {
    expect(STEP_GOAL_OPTIONS).toEqual([5000, 7500, 10000, 15000]);
  });

  it('DEFAULT_STEP_GOAL = 10000', () => {
    expect(DEFAULT_STEP_GOAL).toBe(10000);
  });

  it('ACTIVE_STEP_GOAL_KEY = "active_step_goal"', () => {
    expect(ACTIVE_STEP_GOAL_KEY).toBe('active_step_goal');
  });
});

describe('createGoal — step-goal API (additive, SF-3/SF-9/SF-10)', () => {
  let mockDb;
  let mockGet;
  let mockPut;
  let mockHistoryPut;

  beforeEach(() => {
    mockGet = vi.fn();
    mockPut = vi.fn().mockResolvedValue(undefined);
    mockHistoryPut = vi.fn().mockResolvedValue(undefined);
    mockDb = {
      settings: {
        get: mockGet,
        put: mockPut,
      },
      goal_history: {
        put: mockHistoryPut,
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getActiveStepGoal', () => {
    it.each([5000, 7500, 10000, 15000])(
      'happy read: stored target_steps=%i is returned unmodified, no write',
      async (steps) => {
        mockGet.mockResolvedValue({ key: 'active_step_goal', target_steps: steps });
        const goal = createGoal(mockDb);
        const result = await goal.getActiveStepGoal();

        expect(result).toBe(steps);
        expect(mockPut).not.toHaveBeenCalled();
        expect(mockGet).toHaveBeenCalledWith('active_step_goal');
      }
    );

    it('absent row: returns 10000 and performs exactly one settings.put with the default row', async () => {
      mockGet.mockResolvedValue(undefined);
      const goal = createGoal(mockDb);
      const result = await goal.getActiveStepGoal();

      expect(result).toBe(10000);
      expect(mockPut).toHaveBeenCalledTimes(1);
      expect(mockPut).toHaveBeenCalledWith({ key: 'active_step_goal', target_steps: 10000 });
    });

    it('corrupt row (target_steps: "x"): returns 10000 + lazy write', async () => {
      mockGet.mockResolvedValue({ key: 'active_step_goal', target_steps: 'x' });
      const goal = createGoal(mockDb);
      const result = await goal.getActiveStepGoal();

      expect(result).toBe(10000);
      expect(mockPut).toHaveBeenCalledTimes(1);
      expect(mockPut).toHaveBeenCalledWith({ key: 'active_step_goal', target_steps: 10000 });
    });

    it('corrupt row (target_steps: NaN): returns 10000 + lazy write', async () => {
      mockGet.mockResolvedValue({ key: 'active_step_goal', target_steps: NaN });
      const goal = createGoal(mockDb);
      const result = await goal.getActiveStepGoal();

      expect(result).toBe(10000);
      expect(mockPut).toHaveBeenCalledTimes(1);
    });

    it('out-of-enum row (target_steps: 12000): returns 10000 + lazy write', async () => {
      mockGet.mockResolvedValue({ key: 'active_step_goal', target_steps: 12000 });
      const goal = createGoal(mockDb);
      const result = await goal.getActiveStepGoal();

      expect(result).toBe(10000);
      expect(mockPut).toHaveBeenCalledTimes(1);
      expect(mockPut).toHaveBeenCalledWith({ key: 'active_step_goal', target_steps: 10000 });
    });

    it('not an object: returns 10000 + lazy write', async () => {
      mockGet.mockResolvedValue('invalid');
      const goal = createGoal(mockDb);
      const result = await goal.getActiveStepGoal();

      expect(result).toBe(10000);
      expect(mockPut).toHaveBeenCalledTimes(1);
    });

    it('settings.get rejects: returns 10000, no throw, console.error("[goal]", err)', async () => {
      const err = new Error('DB read failed');
      mockGet.mockRejectedValue(err);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const goal = createGoal(mockDb);
      const result = await goal.getActiveStepGoal();

      expect(result).toBe(10000);
      expect(mockPut).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('[goal]', err);
    });

    it('lazy settings.put rejects: still returns 10000, no throw, console.error("[goal]", err)', async () => {
      mockGet.mockResolvedValue(undefined);
      const err = new Error('DB write failed');
      mockPut.mockRejectedValue(err);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const goal = createGoal(mockDb);
      const result = await goal.getActiveStepGoal();

      expect(result).toBe(10000);
      expect(consoleSpy).toHaveBeenCalledWith('[goal]', err);
    });

    it('SF-3: lazily-written row never contains effective_from, and goal_history.put is never called', async () => {
      mockGet.mockResolvedValue(undefined);
      const goal = createGoal(mockDb);
      await goal.getActiveStepGoal();

      const putArg = mockPut.mock.calls[0][0];
      expect(putArg).not.toHaveProperty('effective_from');
      expect(putArg).not.toHaveProperty('valid_from');
      expect(putArg).toEqual({ key: 'active_step_goal', target_steps: 10000 });
      expect(mockHistoryPut).not.toHaveBeenCalled();
    });
  });

  describe('setActiveStepGoal', () => {
    it.each([5000, 7500, 10000, 15000])(
      '%i → writes exactly { key: "active_step_goal", target_steps: %i }',
      async (steps) => {
        const goal = createGoal(mockDb);
        await goal.setActiveStepGoal(steps);

        expect(mockPut).toHaveBeenCalledTimes(1);
        expect(mockPut).toHaveBeenCalledWith({ key: 'active_step_goal', target_steps: steps });
      }
    );

    it('12000 (out-of-enum): throws TypeError, no write', async () => {
      const goal = createGoal(mockDb);
      await expect(goal.setActiveStepGoal(12000)).rejects.toThrow(TypeError);
      expect(mockPut).not.toHaveBeenCalled();
    });

    it('"10000" (string): throws TypeError, no write', async () => {
      const goal = createGoal(mockDb);
      await expect(goal.setActiveStepGoal('10000')).rejects.toThrow(TypeError);
      expect(mockPut).not.toHaveBeenCalled();
    });

    it('NaN: throws TypeError, no write', async () => {
      const goal = createGoal(mockDb);
      await expect(goal.setActiveStepGoal(NaN)).rejects.toThrow(TypeError);
      expect(mockPut).not.toHaveBeenCalled();
    });

    it('null: throws TypeError, no write', async () => {
      const goal = createGoal(mockDb);
      await expect(goal.setActiveStepGoal(null)).rejects.toThrow(TypeError);
      expect(mockPut).not.toHaveBeenCalled();
    });

    it('undefined: throws TypeError, no write', async () => {
      const goal = createGoal(mockDb);
      await expect(goal.setActiveStepGoal(undefined)).rejects.toThrow(TypeError);
      expect(mockPut).not.toHaveBeenCalled();
    });

    it('settings.put rejects: swallowed with console.error("[goal]", err), does not rethrow', async () => {
      const err = new Error('Write failed');
      mockPut.mockRejectedValue(err);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const goal = createGoal(mockDb);

      await expect(goal.setActiveStepGoal(7500)).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith('[goal]', err);
    });

    it('SF-3: persisted row never contains effective_from, and goal_history.put is never called', async () => {
      const goal = createGoal(mockDb);
      await goal.setActiveStepGoal(7500);

      const putArg = mockPut.mock.calls[0][0];
      expect(putArg).not.toHaveProperty('effective_from');
      expect(putArg).not.toHaveProperty('valid_from');
      expect(putArg).toEqual({ key: 'active_step_goal', target_steps: 7500 });
      expect(mockHistoryPut).not.toHaveBeenCalled();
    });
  });
});
