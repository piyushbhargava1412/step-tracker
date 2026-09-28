import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createGoogleFitConnection,
  GOOGLE_CONNECTED_KEY,
  GOOGLE_CONNECT_LABEL,
} from './google-fit-connection.js';

describe('ST-019: Google Fit connection (web)', () => {
  let auth;
  let storage;
  let tokenHandler;

  beforeEach(() => {
    tokenHandler = null;
    auth = {
      requestToken: vi.fn(),
      onTokenReceived: vi.fn((handler) => { tokenHandler = handler; }),
    };
    const values = new Map();
    storage = {
      getItem: vi.fn((k) => values.get(k) ?? null),
      setItem: vi.fn((k, v) => values.set(k, v)),
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('labels the button "Connect Google Account" and keeps the existing storage key', () => {
    const connection = createGoogleFitConnection({ auth, storage });
    expect(connection.label).toBe(GOOGLE_CONNECT_LABEL);
    expect(GOOGLE_CONNECT_LABEL).toBe('Connect Google Account');
    expect(GOOGLE_CONNECTED_KEY).toBe('google_connected');
  });

  it('connect() starts Google\'s interactive consent', () => {
    createGoogleFitConnection({ auth, storage }).connect();
    expect(auth.requestToken).toHaveBeenCalledWith();
  });

  it('on a token, remembers the connection then runs the listener', async () => {
    const listener = vi.fn().mockResolvedValue(undefined);
    createGoogleFitConnection({ auth, storage }).onConnected(listener);

    await tokenHandler('tok');

    expect(storage.setItem).toHaveBeenCalledWith(GOOGLE_CONNECTED_KEY, '1');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('still runs the listener when remembering the connection fails', async () => {
    storage.setItem.mockImplementation(() => { throw new Error('quota'); });
    const listener = vi.fn();
    createGoogleFitConnection({ auth, storage }).onConnected(listener);

    await tokenHandler('tok');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalled();
  });

  it('restore() silently asks for a token only when the user connected before', () => {
    const connection = createGoogleFitConnection({ auth, storage });
    connection.restore();
    expect(auth.requestToken).not.toHaveBeenCalled();

    storage.setItem(GOOGLE_CONNECTED_KEY, '1');
    connection.restore();
    expect(auth.requestToken).toHaveBeenCalledWith({ prompt: '' });
  });

  it('restore() survives unreadable storage', () => {
    storage.getItem.mockImplementation(() => { throw new Error('blocked'); });
    expect(() => createGoogleFitConnection({ auth, storage }).restore()).not.toThrow();
    expect(auth.requestToken).not.toHaveBeenCalled();
  });
});
