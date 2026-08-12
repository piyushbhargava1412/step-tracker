import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createGoal,
  STEP_GOAL_OPTIONS,
  DEFAULT_STEP_GOAL,
  ACTIVE_STEP_GOAL_KEY,
} from './goal.js';

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

describe('createGoal — step-goal API (SF-3/SF-9/SF-10)', () => {
  let mockDb;
  let mockGet;
  let mockPut;

  beforeEach(() => {
    mockGet = vi.fn();
    mockPut = vi.fn().mockResolvedValue(undefined);
    mockDb = {
      settings: {
        get: mockGet,
        put: mockPut,
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
      const mockHistoryPut = vi.fn();
      const dbWithHistory = {
        settings: { get: mockGet, put: mockPut },
        goal_history: { put: mockHistoryPut },
      };
      mockGet.mockResolvedValue(undefined);
      const goal = createGoal(dbWithHistory);
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
      const mockHistoryPut = vi.fn();
      const dbWithHistory = {
        settings: { get: mockGet, put: mockPut },
        goal_history: { put: mockHistoryPut },
      };
      const goal = createGoal(dbWithHistory);
      await goal.setActiveStepGoal(7500);

      const putArg = mockPut.mock.calls[0][0];
      expect(putArg).not.toHaveProperty('effective_from');
      expect(putArg).not.toHaveProperty('valid_from');
      expect(putArg).toEqual({ key: 'active_step_goal', target_steps: 7500 });
      expect(mockHistoryPut).not.toHaveBeenCalled();
    });

    it('createGoal(db) returns exactly { getActiveStepGoal, setActiveStepGoal } — no legacy km API', () => {
      const goal = createGoal(mockDb);
      expect(typeof goal.getActiveStepGoal).toBe('function');
      expect(typeof goal.setActiveStepGoal).toBe('function');
      expect(goal.getActiveGoal).toBeUndefined();
      expect(goal.setActiveGoal).toBeUndefined();
    });
  });
});
