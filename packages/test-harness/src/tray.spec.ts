import { describe, expect, it } from 'vitest';
import { buildTrayMenuModel, resolveTrayIconVariant } from '../../core/src';

describe('tray helpers', () => {
  it('selects the correct tray icon variant for theme and system appearance', () => {
    expect(resolveTrayIconVariant('system', false)).toBe('light');
    expect(resolveTrayIconVariant('system', true)).toBe('dark');
    expect(resolveTrayIconVariant('light', true)).toBe('light');
    expect(resolveTrayIconVariant('dark', false)).toBe('dark');
  });

  it('enables start and stop actions only when they make sense', () => {
    const idleMenu = buildTrayMenuModel({
      appName: 'Vocsen',
      recordingState: 'idle',
      windowVisible: false,
    });
    const recordingMenu = buildTrayMenuModel({
      appName: 'Vocsen',
      recordingState: 'recording',
      windowVisible: true,
    });
    const processingMenu = buildTrayMenuModel({
      appName: 'Vocsen',
      recordingState: 'processing',
      windowVisible: true,
    });

    expect(idleMenu.find((item) => item.type === 'action' && item.id === 'start-recording')).toMatchObject({
      label: 'Start recording',
      enabled: true,
    });
    expect(idleMenu.find((item) => item.type === 'action' && item.id === 'stop-recording')).toMatchObject({
      label: 'Stop recording',
      enabled: false,
    });

    expect(recordingMenu.find((item) => item.type === 'action' && item.id === 'start-recording')).toMatchObject({
      enabled: false,
    });
    expect(recordingMenu.find((item) => item.type === 'action' && item.id === 'stop-recording')).toMatchObject({
      enabled: true,
    });

    expect(processingMenu.find((item) => item.type === 'status')).toMatchObject({
      label: 'Processing recording',
    });
  });
});
