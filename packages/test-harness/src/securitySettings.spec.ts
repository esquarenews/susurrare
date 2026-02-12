import { describe, expect, it } from 'vitest';
import {
  API_KEY_STORED_MARKER,
  SettingsSchema,
  maskApiKeyForRenderer,
  stripApiKeyFromSettings,
} from '@susurrare/core';

describe('security settings helpers', () => {
  it('strips api key before persistence', () => {
    const settings = SettingsSchema.parse({
      activeModeId: 'default',
      openAiApiKey: 'sk-test-secret',
    });
    const safe = stripApiKeyFromSettings(settings);
    expect(safe.openAiApiKey).toBeUndefined();
  });

  it('masks api key presence for renderer without exposing secret', () => {
    const settings = SettingsSchema.parse({
      activeModeId: 'default',
      openAiApiKey: 'sk-test-secret',
    });
    const masked = maskApiKeyForRenderer(settings);
    expect(masked.openAiApiKey).toBe(API_KEY_STORED_MARKER);
  });

  it('keeps api key field undefined when no secret is configured', () => {
    const settings = SettingsSchema.parse({
      activeModeId: 'default',
    });
    const masked = maskApiKeyForRenderer(settings);
    expect(masked.openAiApiKey).toBeUndefined();
  });
});
