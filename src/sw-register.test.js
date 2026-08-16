import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createSwRegister } from './sw-register.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createSwRegister', () => {
  describe('Happy Path', () => {
    it('calls nav.serviceWorker.register exactly once with "/sw.js" when PROD=true', async () => {
      const register = vi.fn().mockResolvedValue(undefined);
      const nav = { serviceWorker: { register } };
      const { register: registerSw } = createSwRegister({ nav, config: { prod: true } });

      await registerSw();

      expect(register).toHaveBeenCalledTimes(1);
      expect(register).toHaveBeenCalledWith('/sw.js');
    });

    it('resolves without rejection and does not call log when registration succeeds', async () => {
      const log = vi.fn();
      const nav = { serviceWorker: { register: vi.fn().mockResolvedValue(undefined) } };
      const { register: registerSw } = createSwRegister({
        nav,
        config: { prod: true },
        log,
      });

      await expect(registerSw()).resolves.toBeUndefined();
      expect(log).not.toHaveBeenCalled();
    });

    it('returns an object with a register function', () => {
      const factoryResult = createSwRegister({ nav: {}, config: { prod: false } });
      expect(typeof factoryResult.register).toBe('function');
    });
  });

  describe('Edge Cases', () => {
    it('is a no-op that resolves when PROD=false (register never called)', async () => {
      const register = vi.fn().mockResolvedValue(undefined);
      const nav = { serviceWorker: { register } };
      const { register: registerSw } = createSwRegister({ nav, config: { prod: false } });

      await expect(registerSw()).resolves.toBeUndefined();
      expect(register).not.toHaveBeenCalled();
    });

    it('resolves without throwing when nav has no serviceWorker API', async () => {
      const { register: registerSw } = createSwRegister({ nav: {}, config: { prod: true } });

      await expect(registerSw()).resolves.toBeUndefined();
    });

    it.each([undefined, null])('resolves without throwing when nav itself is %p', async (nav) => {
      const { register: registerSw } = createSwRegister({ nav, config: { prod: true } });

      await expect(registerSw()).resolves.toBeUndefined();
    });

    it('resolves without throwing when nav.serviceWorker.register is not a function', async () => {
      const log = vi.fn();
      const nav = { serviceWorker: { register: 'not-a-function' } };
      const { register: registerSw } = createSwRegister({ nav, config: { prod: true }, log });

      await expect(registerSw()).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Case', () => {
    it('catches a rejected register, logs it via the injected log, and resolves (never rethrows)', async () => {
      const error = new Error('registration failed');
      const log = vi.fn();
      const nav = {
        serviceWorker: { register: vi.fn().mockRejectedValue(error) },
      };
      const { register: registerSw } = createSwRegister({ nav, config: { prod: true }, log });

      await expect(registerSw()).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(error);
      expect(nav.serviceWorker.register).toHaveBeenCalledWith('/sw.js');
    });
  });

  describe('Module Shape', () => {
    it('contains no bare navigator references (only the injected nav)', () => {
      const source = readFileSync(path.resolve('src/sw-register.js'), 'utf8');
      expect(source).not.toMatch(/navigator/);
    });
  });
});