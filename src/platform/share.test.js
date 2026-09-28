import { describe, it, expect, vi } from 'vitest';
import { selectShare } from './share.js';

describe('selectShare', () => {
  it('in the app, opens the Android share sheet with the text', async () => {
    const plugin = { share: vi.fn().mockResolvedValue({}) };
    const share = selectShare({ isNative: true, plugin, nav: {} });
    await share('hello');
    expect(plugin.share).toHaveBeenCalledWith({ text: 'hello' });
  });

  it('in a browser with Web Share, uses it', async () => {
    const nav = { share: vi.fn().mockResolvedValue(undefined) };
    const share = selectShare({ isNative: false, plugin: {}, nav });
    await share('hello');
    expect(nav.share).toHaveBeenCalledWith({ text: 'hello' });
  });

  it('in a browser without Web Share there is no share function', () => {
    expect(selectShare({ isNative: false, plugin: {}, nav: {} })).toBeNull();
    expect(selectShare({ isNative: false, plugin: {}, nav: undefined })).toBeNull();
  });

  it('passes a rejection through (the caller reports it)', async () => {
    const plugin = { share: vi.fn().mockRejectedValue(new Error('cancelled')) };
    await expect(selectShare({ isNative: true, plugin, nav: {} })('x')).rejects.toThrow('cancelled');
  });
});
