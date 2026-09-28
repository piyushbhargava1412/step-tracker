import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createHealthConnectConnection,
  HEALTH_CONNECT_CONNECT_LABEL,
  HEALTH_CONNECT_PLAY_STORE_URL,
} from './health-connect-connection.js';

describe('ST-019: Health Connect connection (Android)', () => {
  let health;
  let reporter;
  let launcher;
  let listener;

  beforeEach(() => {
    health = {
      isAvailable: vi.fn().mockResolvedValue({ available: true }),
      requestAuthorization: vi.fn().mockResolvedValue({ readAuthorized: ['steps', 'distance'], readDenied: [] }),
      checkAuthorization: vi.fn().mockResolvedValue({ readAuthorized: ['steps', 'distance'], readDenied: [] }),
    };
    reporter = { auth: vi.fn() };
    launcher = { openUrl: vi.fn().mockResolvedValue({ completed: true }) };
    listener = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  const make = () => {
    const connection = createHealthConnectConnection({ health, reporter, launcher });
    connection.onConnected(listener);
    return connection;
  };

  it('labels the button "Connect Health Connect"', () => {
    expect(make().label).toBe(HEALTH_CONNECT_CONNECT_LABEL);
    expect(HEALTH_CONNECT_CONNECT_LABEL).toBe('Connect Health Connect');
  });

  it('connect() asks for steps + distance (with history) and syncs once steps are allowed', async () => {
    await make().connect();

    expect(health.requestAuthorization).toHaveBeenCalledWith({
      read: ['steps', 'distance'],
      requestHistoryAccess: true,
    });
    expect(reporter.auth).toHaveBeenCalledWith('✅ Connected');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('connect() reports a refusal and does not sync', async () => {
    health.requestAuthorization.mockResolvedValue({ readAuthorized: [], readDenied: ['steps', 'distance'] });

    await make().connect();

    expect(reporter.auth).toHaveBeenCalledWith('🔑 Step access not allowed — allow it in Health Connect');
    expect(listener).not.toHaveBeenCalled();
  });

  it('connect() sends the user to the Play Store when Health Connect is missing or outdated', async () => {
    health.isAvailable.mockResolvedValue({ available: false, reason: 'Health Connect needs an update.' });

    await make().connect();

    expect(reporter.auth).toHaveBeenCalledWith('⚠️ Install or update Health Connect, then tap Connect again');
    expect(launcher.openUrl).toHaveBeenCalledWith({ url: HEALTH_CONNECT_PLAY_STORE_URL });
    expect(HEALTH_CONNECT_PLAY_STORE_URL).toBe(
      'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata'
    );
    expect(health.requestAuthorization).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it('connect() reports a plugin failure instead of throwing', async () => {
    const failure = new Error('boom');
    health.requestAuthorization.mockRejectedValue(failure);

    await expect(make().connect()).resolves.toBeUndefined();

    expect(reporter.auth).toHaveBeenCalledWith('⚠️ Could not reach Health Connect');
    expect(console.error).toHaveBeenCalledWith('[health-connect]', failure);
  });

  it('restore() marks the app connected and syncs when access was granted before', async () => {
    await make().restore();

    expect(health.checkAuthorization).toHaveBeenCalledWith({ read: ['steps', 'distance'] });
    expect(health.requestAuthorization).not.toHaveBeenCalled();
    expect(reporter.auth).toHaveBeenCalledWith('✅ Connected');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('restore() stays quiet when access was never granted or Health Connect is missing', async () => {
    health.checkAuthorization.mockResolvedValue({ readAuthorized: [] });
    await make().restore();
    health.isAvailable.mockResolvedValue({ available: false });
    await make().restore();

    expect(reporter.auth).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    expect(launcher.openUrl).not.toHaveBeenCalled();
  });

  it('restore() logs and swallows plugin failures', async () => {
    health.isAvailable.mockRejectedValue(new Error('boom'));
    await expect(make().restore()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('works without a registered listener', async () => {
    const connection = createHealthConnectConnection({ health, reporter, launcher });
    await expect(connection.connect()).resolves.toBeUndefined();
  });
});
