import { SettingsSchema, type Settings } from '../domain/schemas';

export const API_KEY_STORED_MARKER = 'stored-in-secure-store';

export const stripApiKeyFromSettings = (settings: Settings): Settings =>
  SettingsSchema.parse({
    ...settings,
    openAiApiKey: undefined,
  });

export const maskApiKeyForRenderer = (
  settings: Settings,
  marker = API_KEY_STORED_MARKER
): Settings =>
  SettingsSchema.parse({
    ...settings,
    openAiApiKey: settings.openAiApiKey ? marker : undefined,
  });
