import { describe, it, expect, vi } from 'vitest';
import { selectStepSource, connectLabelFor } from './step-source.js';
import { FIT_SOURCE_LABEL } from '../fit-step-source.js';
import { HEALTH_CONNECT_LABEL } from '../health-connect-step-source.js';
import { GOOGLE_CONNECT_LABEL } from './web/google-fit-connection.js';
import { HEALTH_CONNECT_CONNECT_LABEL } from './native/health-connect-connection.js';

const deps = () => ({
  auth: { getAccessToken: vi.fn(), requestToken: vi.fn(), onTokenReceived: vi.fn() },
  reporter: { sync: vi.fn(), auth: vi.fn() },
  storage: { getItem: vi.fn(), setItem: vi.fn() },
  health: { isAvailable: vi.fn(), checkAuthorization: vi.fn(), requestAuthorization: vi.fn(), queryAggregated: vi.fn() },
  launcher: { openUrl: vi.fn() },
});

describe('ST-019: selectStepSource', () => {
  it('uses Google Fit and the Google connection in the browser', () => {
    const { source, connection } = selectStepSource({ isNative: false, ...deps() });
    expect(source.label).toBe(FIT_SOURCE_LABEL);
    expect(connection.label).toBe(GOOGLE_CONNECT_LABEL);
  });

  it('uses Health Connect and the Health Connect connection in the Android app', () => {
    const { source, connection } = selectStepSource({ isNative: true, ...deps() });
    expect(source.label).toBe(HEALTH_CONNECT_LABEL);
    expect(connection.label).toBe(HEALTH_CONNECT_CONNECT_LABEL);
  });
});

describe('ST-019: connectLabelFor', () => {
  it('matches each platform connection label', () => {
    expect(connectLabelFor(false)).toBe(GOOGLE_CONNECT_LABEL);
    expect(connectLabelFor(true)).toBe(HEALTH_CONNECT_CONNECT_LABEL);
  });
});
