import { describe, it, expect, vi } from 'vitest';
import {
  createGoogleDriveConnection,
  GOOGLE_DRIVE_CONNECT_LABEL,
  GOOGLE_DRIVE_CONNECTED_KEY,
} from './google-drive-connection.js';

describe('ST-020: Google Drive connection (Android app)', () => {
  it('has its own label and its own "connected before" flag, separate from the web one', async () => {
    let handler;
    const auth = { requestToken: vi.fn(), getAccessToken: vi.fn(() => null), onTokenReceived: vi.fn((h) => { handler = h; }) };
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    const connection = createGoogleDriveConnection({ auth, storage });
    connection.onConnected(vi.fn());

    await handler('tok');

    expect(connection.label).toBe(GOOGLE_DRIVE_CONNECT_LABEL);
    expect(GOOGLE_DRIVE_CONNECT_LABEL).toBe('Connect Google Drive');
    expect(storage.setItem).toHaveBeenCalledWith(GOOGLE_DRIVE_CONNECTED_KEY, '1');
    expect(GOOGLE_DRIVE_CONNECTED_KEY).toBe('google_drive_connected');
  });
});
