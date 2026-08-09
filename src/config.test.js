import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('config module', () => {
  beforeEach(() => {
    // Clear the module cache before each test to ensure fresh imports
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('Happy Path', () => {
    it('should return { CLIENT_ID } when VITE_CLIENT_ID is set to a non-empty string', async () => {
      vi.stubEnv('VITE_CLIENT_ID', 'my-client-id');
      const config = await import('./config.js');
      expect(config.CLIENT_ID).toBe('my-client-id');
    });

    it('should export CLIENT_ID that equals exactly the env-var value (no transformation)', async () => {
      const testValue = 'test-client-123-xyz';
      vi.stubEnv('VITE_CLIENT_ID', testValue);
      const config = await import('./config.js');
      expect(config.CLIENT_ID).toBe(testValue);
    });
  });

  describe('Error Cases', () => {
    it('should throw Error containing "Missing VITE_CLIENT_ID" when env var is undefined', async () => {
      vi.stubEnv('VITE_CLIENT_ID', undefined);
      await expect(() => {
        return import('./config.js');
      }).rejects.toThrow(/Missing VITE_CLIENT_ID/);
    });

    it('should throw when VITE_CLIENT_ID is an empty string', async () => {
      vi.stubEnv('VITE_CLIENT_ID', '');
      await expect(() => {
        return import('./config.js');
      }).rejects.toThrow(/Missing VITE_CLIENT_ID/);
    });

    it('should throw when VITE_CLIENT_ID is a whitespace-only string', async () => {
      vi.stubEnv('VITE_CLIENT_ID', '   ');
      await expect(() => {
        return import('./config.js');
      }).rejects.toThrow(/Missing VITE_CLIENT_ID/);
    });
  });

  describe('Regression Tests', () => {
    it('should not reference window.APP_CONFIG in the source code', async () => {
      // Read source file to verify no APP_CONFIG reference
      const sourceModule = await import('./config.js?raw');
      const sourceCode = sourceModule.default;
      expect(sourceCode).not.toContain('APP_CONFIG');
    });
  });
});
