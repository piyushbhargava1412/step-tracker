import { describe, it, expect } from 'vitest';
import {
  SYNC_ERROR_NAME,
  FAILURE_AUTH_EXPIRED,
  FAILURE_RETRY_EXHAUSTED,
  FAILURE_HTTP_ERROR,
  FAILURE_NETWORK_ERROR,
  syncFailure,
  assertStepSource,
} from './step-source.js';

/** A minimal object satisfying the StepSource contract. */
function makeSource(overrides = {}) {
  return {
    label: 'Fake Source',
    notReadyMessage: '🔑 Connect the fake source first',
    accessLostMessage: 'Access lost — reconnect the fake source',
    isReady: () => true,
    fetchDays: async () => [],
    ...overrides,
  };
}

describe('ST-016: step-source.js — StepSource port and classified-failure vocabulary', () => {
  describe('failure constants', () => {
    it('exposes the four failure kinds and the error name every source throws with', () => {
      expect(SYNC_ERROR_NAME).toBe('StepSyncError');
      expect(FAILURE_AUTH_EXPIRED).toBe('auth-expired');
      expect(FAILURE_RETRY_EXHAUSTED).toBe('retry-exhausted');
      expect(FAILURE_HTTP_ERROR).toBe('http-error');
      expect(FAILURE_NETWORK_ERROR).toBe('network-error');
    });
  });

  describe('syncFailure', () => {
    it('carries the kind, status and chunk coordinates the engine renders from', () => {
      const error = syncFailure({
        kind: FAILURE_HTTP_ERROR,
        status: 403,
        index: 2,
        total: 5,
        phase: 'Incremental sync',
      });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(SYNC_ERROR_NAME);
      expect(error.kind).toBe(FAILURE_HTTP_ERROR);
      expect(error.status).toBe(403);
      expect(error.index).toBe(2);
      expect(error.total).toBe(5);
      expect(error.phase).toBe('Incremental sync');
      expect(error.message).toContain('(HTTP 403)');
      expect(error.cause).toBeUndefined();
    });

    it('omits the status suffix and preserves the cause for a thrown network failure', () => {
      const cause = new TypeError('Failed to fetch');
      const error = syncFailure({
        kind: FAILURE_NETWORK_ERROR,
        status: null,
        index: 1,
        total: 1,
        phase: 'Full history sync',
        cause,
      });

      expect(error.message).not.toContain('HTTP');
      expect(error.cause).toBe(cause);
    });
  });

  describe('assertStepSource', () => {
    it('returns the source unchanged when every contract member is present', () => {
      const source = makeSource();
      expect(assertStepSource(source)).toBe(source);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a non-object', 'google-fit'],
    ])('throws a TypeError for %s', (_label, value) => {
      expect(() => assertStepSource(value)).toThrow(TypeError);
    });

    it.each([
      ['label', { label: '' }],
      ['notReadyMessage', { notReadyMessage: undefined }],
      ['accessLostMessage', { accessLostMessage: 42 }],
      ['isReady', { isReady: 'yes' }],
      ['fetchDays', { fetchDays: undefined }],
    ])('names the missing or invalid member "%s"', (member, overrides) => {
      expect(() => assertStepSource(makeSource(overrides))).toThrow(
        new RegExp(`StepSource\\.${member}`)
      );
    });
  });
});
