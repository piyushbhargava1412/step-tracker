import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGoogleConnection } from './google-connection.js';

describe('ST-020: createGoogleConnection', () => {
  let auth, storage, handler;

  beforeEach(() => {
    handler = null;
    let token = null;
    auth = {
      requestToken: vi.fn(),
      getAccessToken: vi.fn(() => token),
      onTokenReceived: vi.fn((h) => { handler = async (t) => { token = t; await h(t); }; }),
    };
    const values = new Map();
    storage = { getItem: vi.fn((k) => values.get(k) ?? null), setItem: vi.fn((k, v) => values.set(k, v)) };
  });

  const make = () => createGoogleConnection({ auth, storage, label: 'Connect Google Drive', flagKey: 'google_drive_connected' });

  it('exposes its label and reports connection from the token', async () => {
    const c = make();
    c.onConnected(vi.fn());
    expect(c.label).toBe('Connect Google Drive');
    expect(c.isConnected()).toBe(false);
    await handler('tok');
    expect(c.isConnected()).toBe(true);
  });

  it('remembers a connection under its own flag and restores silently with it', async () => {
    const c = make();
    c.onConnected(vi.fn());
    await handler('tok');
    expect(storage.setItem).toHaveBeenCalledWith('google_drive_connected', '1');
    c.restore();
    expect(auth.requestToken).toHaveBeenCalledWith({ prompt: '' });
  });
});
