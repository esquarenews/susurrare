import { describe, expect, it } from 'vitest';
import { getHotkeyStartupFailureMessage } from '@susurrare/core';

describe('hotkey startup policy', () => {
  it('fails loudly in macOS development when push-to-talk is unavailable', () => {
    expect(
      getHotkeyStartupFailureMessage({
        platform: 'darwin',
        hotkeysEnabled: true,
        isPackaged: false,
        pushToTalkRegistered: false,
        pushToTalkKey: 'F15',
      })
    ).toContain('Push-to-talk hotkey F15 failed to register during development startup.');
  });

  it('does not fail when push-to-talk is available', () => {
    expect(
      getHotkeyStartupFailureMessage({
        platform: 'darwin',
        hotkeysEnabled: true,
        isPackaged: false,
        pushToTalkRegistered: true,
        pushToTalkKey: 'F15',
      })
    ).toBeNull();
  });

  it('does not fail loudly outside macOS development', () => {
    expect(
      getHotkeyStartupFailureMessage({
        platform: 'win32',
        hotkeysEnabled: true,
        isPackaged: false,
        pushToTalkRegistered: false,
        pushToTalkKey: 'F15',
      })
    ).toBeNull();
    expect(
      getHotkeyStartupFailureMessage({
        platform: 'darwin',
        hotkeysEnabled: true,
        isPackaged: true,
        pushToTalkRegistered: false,
        pushToTalkKey: 'F15',
      })
    ).toBeNull();
  });
});
