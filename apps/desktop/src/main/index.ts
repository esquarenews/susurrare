import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeTheme,
  nativeImage,
  shell,
  globalShortcut,
  session,
  systemPreferences,
  powerMonitor,
} from 'electron';
import type { Input, MenuItemConstructorOptions } from 'electron';
import { execFile, spawn } from 'child_process';
import { join } from 'path';
import { existsSync, writeFileSync } from 'fs';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import WebSocket from 'ws';
import {
  DiagnosticsExportSchema,
  HistoryItemSchema,
  IPC_VERSION,
  IpcChannels,
  InsertActionSchema,
  ModelInfoSchema,
  SettingsSchema,
  StatsSummaryRequestSchema,
  StatsSummaryResponseSchema,
  RecordingCommandSchema,
  createSpeechToTextSession,
  createTranscriptionClient,
  estimateSafeOpenAiTranscriptionDurationMs,
  buildStatsSummaryPromptInput,
  buildTrayMenuModel,
  maskApiKeyForRenderer,
  resolveTrayIconVariant,
  resolveRecordingSilenceTimeoutMs,
  resolveRecordingStreamingEnabled,
  stripApiKeyFromSettings,
  type WebSocketLike,
  type Settings,
  ModeSchema,
  VocabularyEntrySchema,
  ShortcutEntrySchema,
  HistoryPinSchema,
  HistoryExportSchema,
  AppInfoSchema,
  shouldWarmSoundPlayer,
  type TrayRecordingState,
} from '@susurrare/core';
import { platformAdapter } from './platform';
import { loadState, saveState } from './store';
import { exportDiagnostics, recordError } from './diagnostics';
import { deleteOpenAiApiKey, loadOpenAiApiKey, saveOpenAiApiKey } from './keychain';

let mainWindow: BrowserWindow | null = null;
let speechSession: ReturnType<typeof createSpeechToTextSession> | null = null;
let recordingActive = false;
let recordingStopInProgress = false;
let streamingEnabled = true;
let hotkeyAttached = false;
let hotkeyHandle: { unregister: () => Promise<void> } | null = null;
let toggleHandle: { unregister: () => Promise<void> } | null = null;
let cancelHandle: { unregister: () => Promise<void> } | null = null;
let changeModeHandle: { unregister: () => Promise<void> } | null = null;
const HOLD_START_DELAY_MS = 120;
const MIN_PROCESSING_OVERLAY_MS = 700;
let holdStartTimer: NodeJS.Timeout | null = null;
let holdKeyActive = false;
const hotkeysEnabled = process.env.SUSURRARE_DISABLE_HOTKEYS !== '1';
let updateTimer: NodeJS.Timeout | null = null;
let tray: Tray | null = null;
let overlayHideTimer: NodeJS.Timeout | null = null;
let modeOverlayTimer: NodeJS.Timeout | null = null;
let lastOverlayPartial = '';
const suppressionHotkeys = new Set<string>();
let lastSoundAt = 0;
let silenceStopRequested = false;
let trayRecordingState: TrayRecordingState = 'idle';
const SILENCE_RMS_THRESHOLD = 0.012;
const RECORDING_LIMIT_WARNING_WINDOW_MS = 60_000;
const RECORDING_LIMIT_MIN_WARNING_MS = 5_000;
const APP_BRAND_NAME = 'Vocsen';
const SOUND_WARM_STALE_AFTER_MS = 1000 * 60 * 6;
const SOUND_WARM_MIN_INTERVAL_MS = 800;
const SOUND_WARM_MAINTENANCE_INTERVAL_MS = 1000 * 60 * 2;
let soundWarmTimer: NodeJS.Timeout | null = null;
let recordingTargetAppName: string | null = null;

const shouldShowOverlay = () => settings.overlayStyle !== 'hide';

const ensureMicrophoneAccess = async () => {
  if (process.platform !== 'darwin') return true;
  const status = systemPreferences.getMediaAccessStatus('microphone');
  if (status === 'granted') return true;
  if (status === 'denied' || status === 'restricted') return false;
  return systemPreferences.askForMediaAccess('microphone');
};

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeAppName = (value: string | null | undefined) => value?.trim().toLowerCase() ?? '';

const isSusurrareAppName = (value: string | null | undefined) =>
  normalizeAppName(value).includes('susurrare');

const isSameAppName = (first: string | null | undefined, second: string | null | undefined) => {
  const normalizedFirst = normalizeAppName(first);
  const normalizedSecond = normalizeAppName(second);
  return normalizedFirst.length > 0 && normalizedFirst === normalizedSecond;
};

const quoteAppleScriptString = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const activateAppByName = async (name: string) => {
  if (process.platform !== 'darwin') return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  const script = `tell application "${quoteAppleScriptString(trimmed)}" to activate`;
  return new Promise<boolean>((resolve) => {
    execFile('/usr/bin/osascript', ['-e', script], (error) => {
      resolve(!error);
    });
  });
};

const stripControlCharacters = (value: string) => {
  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const isControl = (code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
    if (!isControl) {
      output += value[index];
    }
  }
  return output;
};

const sanitizeMaybeString = (value: unknown, maxLength: number, trim = false) => {
  if (typeof value !== 'string') return value;
  const sanitized = stripControlCharacters(value);
  const normalized = trim ? sanitized.trim() : sanitized;
  return normalized.slice(0, maxLength);
};

const sanitizeSettingsPayload = (payload: unknown): JsonRecord => {
  if (!isRecord(payload)) return {};
  const sanitized: JsonRecord = { ...payload };

  if (Object.prototype.hasOwnProperty.call(payload, 'activeModeId')) {
    sanitized.activeModeId = sanitizeMaybeString(payload.activeModeId, 128, true);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'pushToTalkKey')) {
    sanitized.pushToTalkKey = sanitizeMaybeString(payload.pushToTalkKey, 64, true);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'toggleRecordingKey')) {
    sanitized.toggleRecordingKey = sanitizeMaybeString(payload.toggleRecordingKey, 64, true);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'cancelKey')) {
    sanitized.cancelKey = sanitizeMaybeString(payload.cancelKey, 64, true);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'changeModeShortcut')) {
    sanitized.changeModeShortcut = sanitizeMaybeString(payload.changeModeShortcut, 64, true);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'transcriptionLanguage')) {
    sanitized.transcriptionLanguage = sanitizeMaybeString(
      payload.transcriptionLanguage,
      24,
      true
    );
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'openAiApiKey')) {
    const sanitizedApiKey = sanitizeMaybeString(payload.openAiApiKey, 512, true);
    sanitized.openAiApiKey = sanitizedApiKey === '' ? undefined : sanitizedApiKey;
  }

  return sanitized;
};

const sanitizeModePayload = (payload: unknown): JsonRecord => {
  if (!isRecord(payload)) return {};
  const modelPayload = isRecord(payload.model) ? payload.model : undefined;
  const sanitizedVocabularySetIds = Array.isArray(payload.vocabularySetIds)
    ? payload.vocabularySetIds
        .map((value) => sanitizeMaybeString(value, 32, true))
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    : payload.vocabularySetIds;
  return {
    ...payload,
    id: sanitizeMaybeString(payload.id, 128, true),
    name: sanitizeMaybeString(payload.name, 120, true),
    description: sanitizeMaybeString(payload.description, 1000),
    rewritePrompt: sanitizeMaybeString(payload.rewritePrompt, 4000),
    vocabularySetIds: sanitizedVocabularySetIds,
    model: modelPayload
      ? {
          ...modelPayload,
          pinnedModelId: sanitizeMaybeString(modelPayload.pinnedModelId, 128, true),
        }
      : undefined,
  };
};

const sanitizeVocabularyPayload = (payload: unknown): JsonRecord => {
  if (!isRecord(payload)) return {};
  return {
    ...payload,
    id: sanitizeMaybeString(payload.id, 128, true),
    source: sanitizeMaybeString(payload.source, 300),
    replacement: sanitizeMaybeString(payload.replacement, 1200),
    modeId: sanitizeMaybeString(payload.modeId, 128, true),
  };
};

const sanitizeShortcutPayload = (payload: unknown): JsonRecord => {
  if (!isRecord(payload)) return {};
  return {
    ...payload,
    id: sanitizeMaybeString(payload.id, 128, true),
    keyword: sanitizeMaybeString(payload.keyword, 120),
    snippet: sanitizeMaybeString(payload.snippet, 12000),
    modeId: sanitizeMaybeString(payload.modeId, 128, true),
  };
};

const sanitizeHistoryPayload = (payload: unknown): JsonRecord => {
  if (!isRecord(payload)) return {};
  const diarizedSegments = Array.isArray(payload.diarizedSegments)
    ? payload.diarizedSegments
        .filter((segment): segment is JsonRecord => isRecord(segment))
        .map((segment) => ({
          ...segment,
          id: sanitizeMaybeString(segment.id, 128, true),
          speaker: sanitizeMaybeString(segment.speaker, 128),
          text: sanitizeMaybeString(segment.text, 50000),
        }))
    : payload.diarizedSegments;
  const processingSteps = Array.isArray(payload.processingSteps)
    ? payload.processingSteps
        .map((step) => sanitizeMaybeString(step, 120))
        .filter((step): step is string => typeof step === 'string')
    : payload.processingSteps;
  return {
    ...payload,
    id: sanitizeMaybeString(payload.id, 128, true),
    text: sanitizeMaybeString(payload.text, 50000),
    modeId: sanitizeMaybeString(payload.modeId, 128, true),
    modelId: sanitizeMaybeString(payload.modelId, 128, true),
    rawText: sanitizeMaybeString(payload.rawText, 50000),
    processedText: sanitizeMaybeString(payload.processedText, 50000),
    appName: sanitizeMaybeString(payload.appName, 200),
    errorCode: sanitizeMaybeString(payload.errorCode, 128, true),
    errorMessage: sanitizeMaybeString(payload.errorMessage, 4000),
    processingSteps,
    diarizedSegments,
  };
};

const parseAllowedUrl = (
  value: string,
  options: { allowFile?: boolean; allowHttpLocalhost?: boolean } = {}
) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:') return parsed.toString();
    if (options.allowFile && parsed.protocol === 'file:') return parsed.toString();
    if (options.allowHttpLocalhost && parsed.protocol === 'http:') {
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1') {
        return parsed.toString();
      }
    }
    return null;
  } catch {
    return null;
  }
};

const resolveDevServerOrigin = () => {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (!devServerUrl) return null;
  try {
    return new URL(devServerUrl).origin;
  } catch {
    recordError(new Error('Invalid VITE_DEV_SERVER_URL. Falling back to local file renderer.'));
    return null;
  }
};

const isAllowedRendererNavigation = (url: string, devServerOrigin: string | null) => {
  if (url.startsWith('file://')) return true;
  if (!devServerOrigin) return false;
  try {
    return new URL(url).origin === devServerOrigin;
  } catch {
    return false;
  }
};

const getMainWindow = () => {
  if (!mainWindow) return null;
  try {
    if (mainWindow.isDestroyed()) {
      mainWindow = null;
      hotkeyAttached = false;
      return null;
    }
    return mainWindow;
  } catch {
    mainWindow = null;
    hotkeyAttached = false;
    return null;
  }
};

const createWindow = () => {
  const devServerOrigin = resolveDevServerOrigin();
  const win = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 900,
    minHeight: 640,
    title: 'Susurrare',
    webPreferences: {
      preload: (() => {
        const cjs = join(__dirname, '../preload/index.cjs');
        if (existsSync(cjs)) return cjs;
        const js = join(__dirname, '../preload/index.js');
        if (existsSync(js)) return js;
        return join(__dirname, '../preload/index.mjs');
      })(),
      autoplayPolicy: 'no-user-gesture-required',
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  mainWindow = win;

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
    hotkeyAttached = false;
    updateTrayMenu();
  });
  win.on('show', updateTrayMenu);
  win.on('hide', updateTrayMenu);

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (isAllowedRendererNavigation(url, devServerOrigin)) return;
    event.preventDefault();
  });

  if (process.env.VITE_DEV_SERVER_URL && isAllowedRendererNavigation(process.env.VITE_DEV_SERVER_URL, devServerOrigin)) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  attachLocalHotkeys(win);
  sendRecordingStatus('idle');
  updateTrayMenu();
};

const applyLoginItemSettings = () => {
  if (process.platform !== 'darwin') return;
  app.setLoginItemSettings({ openAtLogin: settings.launchOnLogin });
};

const configureAutoUpdater = () => {
  const feedUrl = process.env.SUSURRARE_UPDATE_URL;
  if (!feedUrl) return;
  const parsedFeedUrl = parseAllowedUrl(feedUrl, {
    allowHttpLocalhost: !app.isPackaged,
  });
  if (parsedFeedUrl) {
    autoUpdater.setFeedURL({ provider: 'generic', url: parsedFeedUrl });
    return;
  }
  recordError(new Error('Ignored SUSURRARE_UPDATE_URL because it is not an allowed URL.'));
};

const scheduleUpdateChecks = () => {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
  if (!settings.updateChecks) return;
  updateTimer = setInterval(() => {
    autoUpdater.checkForUpdates().catch((error: unknown) => {
      recordError(error);
    });
  }, 1000 * 60 * 60 * 4);
};

const applyThemeSource = () => {
  nativeTheme.themeSource = settings.theme ?? 'system';
};

let startSoundPath: string | null = null;
let endSoundPath: string | null = null;
let lastSoundWarmAt = 0;
let soundWarmInFlight = false;

const resolveSoundPath = (fileName: string) => {
  const basePath = app.isPackaged ? process.resourcesPath : app.getAppPath();
  const candidates = [
    join(basePath, 'resources', 'sounds', fileName),
    join(basePath, '..', 'resources', 'sounds', fileName),
    join(process.cwd(), 'apps', 'desktop', 'resources', 'sounds', fileName),
    join(process.cwd(), 'apps', 'desktop', 'src', 'renderer', 'public', 'images', fileName),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
};

const preloadSoundEffects = () => {
  startSoundPath ??= resolveSoundPath('start_recording.wav');
  endSoundPath ??= resolveSoundPath('end-recording.wav');
};

const warmSoundPlayer = (options: { force?: boolean } = {}) => {
  if (process.platform !== 'darwin') return;
  if (!startSoundPath || !endSoundPath) preloadSoundEffects();
  const warmPath = startSoundPath ?? endSoundPath;
  if (!warmPath) return;
  const nowMs = Date.now();
  if (
    !shouldWarmSoundPlayer({
      nowMs,
      lastWarmAtMs: lastSoundWarmAt,
      inFlight: soundWarmInFlight,
      force: options.force,
      minIntervalMs: SOUND_WARM_MIN_INTERVAL_MS,
      staleAfterMs: SOUND_WARM_STALE_AFTER_MS,
    })
  ) {
    return;
  }
  soundWarmInFlight = true;
  lastSoundWarmAt = nowMs;
  try {
    const child = spawn('/usr/bin/afplay', ['-v', '0', '-t', '0.02', warmPath], {
      stdio: 'ignore',
    });
    child.once('error', (error) => {
      soundWarmInFlight = false;
      recordError(error);
    });
    child.once('close', () => {
      soundWarmInFlight = false;
    });
    child.unref();
  } catch (error) {
    soundWarmInFlight = false;
    recordError(error);
  }
};

const scheduleSoundWarmMaintenance = () => {
  if (process.platform !== 'darwin') return;
  if (soundWarmTimer) {
    clearInterval(soundWarmTimer);
    soundWarmTimer = null;
  }
  soundWarmTimer = setInterval(() => {
    warmSoundPlayer();
  }, SOUND_WARM_MAINTENANCE_INTERVAL_MS);
  soundWarmTimer.unref();
};

const playSoundEffect = (kind: 'start' | 'end') => {
  if (process.platform !== 'darwin') return;
  if (!settings.soundEffects) return;
  const volumeSetting = settings.soundEffectsVolume ?? 65;
  if (volumeSetting <= 0) return;
  if (!startSoundPath || !endSoundPath) preloadSoundEffects();
  const soundPath = kind === 'start' ? startSoundPath : endSoundPath;
  if (!soundPath) return;
  const volume = Math.min(1, volumeSetting / 100) * 0.6;
  try {
    const child = spawn('/usr/bin/afplay', ['-v', volume.toFixed(2), soundPath], {
      stdio: 'ignore',
    });
    child.unref();
  } catch (error) {
    recordError(error);
  }
};

const getTrayThemePreference = (): 'light' | 'dark' | 'system' =>
  process.platform === 'darwin' ? 'system' : settings.theme ?? 'system';

const resolveTrayIconPath = (theme: 'light' | 'dark' | 'system') => {
  const variant = resolveTrayIconVariant(theme, nativeTheme.shouldUseDarkColors);
  const iconName = `tray-${variant}.png`;
  const basePath = app.isPackaged ? process.resourcesPath : app.getAppPath();
  const iconPath = join(basePath, 'resources', 'tray', iconName);
  if (existsSync(iconPath)) return iconPath;
  const fallbackName = variant === 'dark' ? 'tray-light.png' : 'tray-dark.png';
  const fallbackPath = join(basePath, 'resources', 'tray', fallbackName);
  return existsSync(fallbackPath) ? fallbackPath : iconPath;
};

const createTrayImage = (theme: 'light' | 'dark' | 'system') => {
  const iconPath = resolveTrayIconPath(theme);
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) return image;
  const resized = image.resize({ width: 18, height: 18 });
  return resized;
};

const updateTrayIcon = () => {
  if (!tray) return;
  const image = createTrayImage(getTrayThemePreference());
  if (!image.isEmpty()) {
    tray.setImage(image);
  }
};

const getTrayWindowVisible = () => {
  const win = getMainWindow();
  if (!win) return false;
  try {
    return win.isVisible();
  } catch {
    return false;
  }
};

const openHelpPage = async (sectionId?: string | null) => {
  const url = resolveHelpUrl(sectionId);
  try {
    await shell.openExternal(url);
    return true;
  } catch (error) {
    recordError(error);
    return false;
  }
};

const buildTrayContextMenu = () => {
  const template: MenuItemConstructorOptions[] = buildTrayMenuModel({
    appName: APP_BRAND_NAME,
    recordingState: trayRecordingState,
    windowVisible: getTrayWindowVisible(),
  }).map((entry) => {
    if (entry.type === 'separator') {
      return { type: 'separator' };
    }
    if (entry.type === 'status') {
      return { label: entry.label, enabled: false };
    }
    switch (entry.id) {
      case 'toggle-window':
        return { label: entry.label, enabled: entry.enabled, click: toggleMainWindow };
      case 'start-recording':
        return {
          label: entry.label,
          enabled: entry.enabled,
          click: () => {
            void startRecording();
          },
        };
      case 'stop-recording':
        return {
          label: entry.label,
          enabled: entry.enabled,
          click: () => {
            void stopRecording();
          },
        };
      case 'help':
        return {
          label: entry.label,
          enabled: entry.enabled,
          click: () => {
            void openHelpPage();
          },
        };
      case 'quit':
        return { label: entry.label, enabled: entry.enabled, click: () => app.quit() };
    }
  });
  return Menu.buildFromTemplate(template);
};

const updateTrayMenu = () => {
  if (!tray) return;
  tray.setContextMenu(buildTrayContextMenu());
};

const toggleMainWindow = () => {
  const win = getMainWindow();
  if (!win) {
    createWindow();
    return;
  }
  try {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
    updateTrayMenu();
  } catch (error) {
    recordError(error);
    mainWindow = null;
    hotkeyAttached = false;
    updateTrayMenu();
  }
};

const createTray = () => {
  if (tray) return;
  tray = new Tray(createTrayImage(getTrayThemePreference()));
  tray.setToolTip(APP_BRAND_NAME);
  tray.on('click', toggleMainWindow);
  updateTrayMenu();
};

const sanitizeHelpSectionId = (value: unknown) => {
  const sanitized = sanitizeMaybeString(value, 64, true);
  if (typeof sanitized !== 'string' || !sanitized) return null;
  if (!/^[a-z0-9-]+$/i.test(sanitized)) return null;
  return sanitized;
};

const resolveHelpUrl = (sectionId?: string | null) => {
  const safeSectionId = sanitizeHelpSectionId(sectionId);
  if (process.env.SUSURRARE_HELP_URL) {
    const parsedHelpUrl = parseAllowedUrl(process.env.SUSURRARE_HELP_URL, {
      allowFile: true,
      allowHttpLocalhost: !app.isPackaged,
    });
    if (parsedHelpUrl) {
      if (!safeSectionId) return parsedHelpUrl;
      try {
        const url = new URL(parsedHelpUrl);
        url.hash = safeSectionId;
        return url.toString();
      } catch {
        return parsedHelpUrl;
      }
    }
    recordError(new Error('Ignored SUSURRARE_HELP_URL because it is not an allowed URL.'));
  }
  const defaultHelpUrl = 'https://susurrare.tech/help.html';
  if (!safeSectionId) return defaultHelpUrl;
  try {
    const url = new URL(defaultHelpUrl);
    url.hash = safeSectionId;
    return url.toString();
  } catch {
    return `${defaultHelpUrl}#${safeSectionId}`;
  }
};

let history: Array<ReturnType<typeof HistoryItemSchema.parse>> = [];
let settings = SettingsSchema.parse({});
let modes: Array<ReturnType<typeof ModeSchema.parse>> = [];
let vocabulary: Array<ReturnType<typeof VocabularyEntrySchema.parse>> = [];
let shortcuts: Array<ReturnType<typeof ShortcutEntrySchema.parse>> = [];

const models = [
  {
    id: 'gpt-4o-mini-transcribe',
    name: 'GPT-4o Mini Transcribe',
    speed: 'fast',
    description: 'Low-latency streaming transcription for live dictation.',
  },
  {
    id: 'gpt-4o-transcribe-diarize',
    name: 'GPT-4o Transcribe Diarize',
    speed: 'balanced',
    description: 'Speaker diarization for meetings and multi-speaker transcripts.',
  },
  {
    id: 'gpt-4o-transcribe',
    name: 'GPT-4o Transcribe',
    speed: 'accurate',
    description: 'Higher accuracy for longer dictations.',
  },
].map((model) => ModelInfoSchema.parse(model));

const wrapEnvelope = (payload: unknown) => ({
  version: IPC_VERSION,
  payload,
});

const sendRecordingStatus = (
  status: 'idle' | 'recording' | 'processing' | 'error',
  message?: string
) => {
  trayRecordingState = status;
  updateTrayMenu();
  const win = getMainWindow();
  if (!win) return;
  try {
    if (win.webContents.isDestroyed()) return;
    win.webContents.send(
      IpcChannels.recordingStatus,
      wrapEnvelope({ status, timestamp: Date.now(), message })
    );
  } catch (error) {
    recordError(error);
  }
};

const pause = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms);
});

const computeRms = (data: Uint8Array) => {
  if (data.length < 2) return 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const totalSamples = Math.floor(data.length / 2);
  let sum = 0;
  for (let i = 0; i < totalSamples; i += 1) {
    const sample = view.getInt16(i * 2, true) / 32768;
    sum += sample * sample;
  }
  return totalSamples ? Math.sqrt(sum / totalSamples) : 0;
};

const sendHistoryUpdated = () => {
  const win = getMainWindow();
  if (!win) return;
  try {
    if (win.webContents.isDestroyed()) return;
    win.webContents.send(
      IpcChannels.historyUpdated,
      wrapEnvelope(history.map((item) => HistoryItemSchema.parse(item)))
    );
  } catch (error) {
    recordError(error);
  }
};

const normalizeShortcut = (shortcut: string) => {
  const tokens = shortcut
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean);
  const modifiers = new Set(tokens.map((token) => token.toLowerCase()));
  const mainKey = tokens[tokens.length - 1]?.toLowerCase() ?? '';
  return { modifiers, mainKey };
};

const normalizeShortcutMainKey = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const lowered = trimmed.toLowerCase();
  const aliases: Record<string, string> = {
    esc: 'escape',
    return: 'enter',
    del: 'delete',
    control: 'ctrl',
    command: 'cmd',
    meta: 'cmd',
    alt: 'option',
    arrowup: 'up',
    arrowdown: 'down',
    arrowleft: 'left',
    arrowright: 'right',
  };
  if (aliases[lowered]) return aliases[lowered];
  if (/^key[a-z]$/i.test(trimmed)) return trimmed.slice(3).toLowerCase();
  if (/^digit\d$/i.test(trimmed)) return trimmed.slice(5).toLowerCase();
  return lowered;
};

const inputMainKey = (input: Input) => {
  const candidates = [input.key, 'code' in input ? input.code : undefined];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = normalizeShortcutMainKey(candidate);
    if (normalized) return normalized;
  }
  return '';
};

const matchesShortcut = (input: Input, shortcut: string) => {
  if (!shortcut) return false;
  const { modifiers, mainKey } = normalizeShortcut(shortcut);
  const required = {
    shift: modifiers.has('shift'),
    control: modifiers.has('ctrl') || modifiers.has('control'),
    alt: modifiers.has('alt') || modifiers.has('option'),
    meta: modifiers.has('cmd') || modifiers.has('command') || modifiers.has('meta'),
  };
  const inputKey = inputMainKey(input);
  if (mainKey && inputKey !== mainKey) return false;
  if (input.shift !== required.shift) return false;
  if (input.control !== required.control) return false;
  if (input.alt !== required.alt) return false;
  if (input.meta !== required.meta) return false;
  return true;
};

const startRecording = async () => {
  if (recordingActive) return;
  try {
    if (!(await ensureMicrophoneAccess())) {
      sendRecordingStatus('error', 'Microphone access is required to start recording.');
      return;
    }
    playSoundEffect('start');
    try {
      recordingTargetAppName = await platformAdapter.app.activeName();
    } catch {
      recordingTargetAppName = null;
    }
    if (overlayHideTimer) {
      clearTimeout(overlayHideTimer);
      overlayHideTimer = null;
    }
    const mode = modes.find((item) => item.id === settings.activeModeId);
    streamingEnabled = resolveRecordingStreamingEnabled(
      mode?.streamingEnabled,
      mode?.model.selection
    );
    lastOverlayPartial = '';
    if (platformAdapter.overlay.setMode) {
      platformAdapter.overlay.setMode(mode?.name ?? 'Default').catch(() => undefined);
    }
    if (shouldShowOverlay()) {
      await platformAdapter.overlay.show('recording');
      if (streamingEnabled) {
        await platformAdapter.overlay.setText('Listening…');
      } else {
        await platformAdapter.overlay.setText('');
      }
    } else {
      await platformAdapter.overlay.hide();
    }
    recordingActive = true;
    silenceStopRequested = false;
    lastSoundAt = Date.now();
    sendRecordingStatus('recording');
    const sampleRate = streamingEnabled ? 24000 : 16000;
    const safeUploadLimitMs = estimateSafeOpenAiTranscriptionDurationMs(sampleRate);
    const safeWarningAtMs = Math.max(
      RECORDING_LIMIT_MIN_WARNING_MS,
      safeUploadLimitMs - RECORDING_LIMIT_WARNING_WINDOW_MS
    );
    const startedAt = Date.now();
    let recordingLimitWarningShown = false;
    const language =
      settings.transcriptionLanguage && settings.transcriptionLanguage !== 'auto'
        ? settings.transcriptionLanguage
        : undefined;
    const silenceTimeoutMs = resolveRecordingSilenceTimeoutMs(settings.recordingTimeoutMs, {
      streamingEnabled,
      modelSelection: mode?.model.selection,
    });
    await speechSession?.start({
      model: mode?.model ?? { selection: 'fast' },
      streamingEnabled,
      silenceRemoval: settings.silenceRemoval,
      language,
      sampleRate,
    });
    const stream = await platformAdapter.audioCapture.start({
      autoGain: settings.autoGain,
      sampleRate,
    });
    (async () => {
      try {
        for await (const chunk of stream) {
          if (!recordingActive) break;
          if (!streamingEnabled && safeUploadLimitMs > 0) {
            const elapsedMs = Date.now() - startedAt;
            if (!recordingLimitWarningShown && elapsedMs >= safeWarningAtMs) {
              recordingLimitWarningShown = true;
              if (shouldShowOverlay()) {
                void platformAdapter.overlay.setText(
                  'Approaching max length. Auto-stopping soon to avoid upload failure.'
                );
              }
            }
            if (elapsedMs >= safeUploadLimitMs) {
              silenceStopRequested = true;
              if (shouldShowOverlay()) {
                void platformAdapter.overlay.setText(
                  'Max safe length reached. Stopping to preserve this recording.'
                );
              }
              void stopRecording();
              break;
            }
          }
          if (!silenceStopRequested && silenceTimeoutMs > 0) {
            const rms = typeof chunk.rms === 'number' ? chunk.rms : computeRms(chunk.data);
            if (rms > SILENCE_RMS_THRESHOLD) {
              lastSoundAt = Date.now();
            } else if (Date.now() - lastSoundAt > silenceTimeoutMs) {
              silenceStopRequested = true;
              void stopRecording();
              break;
            }
          }
          speechSession?.pushAudioChunk({
            data: chunk.data,
            timestamp: chunk.timestamp,
            durationMs: chunk.durationMs,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.toLowerCase().includes('abort')) {
          recordError(error);
        }
      }
    })().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes('abort')) {
        recordError(error);
      }
    });
  } catch (error) {
    recordError(error);
    sendRecordingStatus('error', error instanceof Error ? error.message : String(error));
    recordingActive = false;
    if (overlayHideTimer) {
      clearTimeout(overlayHideTimer);
      overlayHideTimer = null;
    }
    await platformAdapter.overlay.hide();
  }
};

const stopRecording = async () => {
  if (!recordingActive || recordingStopInProgress) return;
  recordingStopInProgress = true;
  try {
    playSoundEffect('end');
    const processingShownAt = Date.now();
    if (shouldShowOverlay()) {
      await platformAdapter.overlay.show('processing');
      await platformAdapter.overlay.setText('');
    } else {
      await platformAdapter.overlay.hide();
    }
    sendRecordingStatus('processing');
    recordingActive = false;
    lastOverlayPartial = '';
    await platformAdapter.audioCapture.stop();
    await speechSession?.finalize();
    if (shouldShowOverlay()) {
      const remainingProcessingMs = MIN_PROCESSING_OVERLAY_MS - (Date.now() - processingShownAt);
      if (remainingProcessingMs > 0) {
        await pause(remainingProcessingMs);
      }
    }
    if (shouldShowOverlay()) {
      await platformAdapter.overlay.show('done');
      if (overlayHideTimer) clearTimeout(overlayHideTimer);
      overlayHideTimer = setTimeout(() => {
        platformAdapter.overlay.hide().catch(() => undefined);
        overlayHideTimer = null;
      }, 2000);
    } else {
      await platformAdapter.overlay.hide();
    }
    sendRecordingStatus('idle');
  } catch (error) {
    recordError(error);
    sendRecordingStatus('error', error instanceof Error ? error.message : String(error));
    if (overlayHideTimer) {
      clearTimeout(overlayHideTimer);
      overlayHideTimer = null;
    }
    await platformAdapter.overlay.hide();
  } finally {
    recordingStopInProgress = false;
  }
};

const cancelRecording = async () => {
  if (!recordingActive || recordingStopInProgress) return;
  try {
    recordingStopInProgress = true;
    recordingActive = false;
    lastOverlayPartial = '';
    await platformAdapter.audioCapture.cancel();
    await speechSession?.cancel();
    if (overlayHideTimer) {
      clearTimeout(overlayHideTimer);
      overlayHideTimer = null;
    }
    await platformAdapter.overlay.hide();
  } finally {
    recordingStopInProgress = false;
    sendRecordingStatus('idle');
  }
};

const handlePushToTalkActive = (active: boolean) => {
  if (active) {
    holdKeyActive = true;
    if (recordingActive) return;
    if (holdStartTimer) return;
    holdStartTimer = setTimeout(() => {
      holdStartTimer = null;
      if (!holdKeyActive || recordingActive) return;
      void startRecording();
    }, HOLD_START_DELAY_MS);
    return;
  }
  holdKeyActive = false;
  if (holdStartTimer) {
    clearTimeout(holdStartTimer);
    holdStartTimer = null;
    return;
  }
  if (recordingActive) {
    void stopRecording();
  }
};

const cycleActiveMode = async () => {
  if (!modes.length) return;
  const currentIndex = modes.findIndex((mode) => mode.id === settings.activeModeId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % modes.length : 0;
  const nextMode = modes[nextIndex];
  if (!nextMode) return;
  settings = SettingsSchema.parse({ ...settings, activeModeId: nextMode.id });
  updatePipelineContext();
  persistState();
  initSpeechSession();
  if (platformAdapter.overlay.setMode) {
    platformAdapter.overlay.setMode(nextMode.name).catch(() => undefined);
  }
  if (!recordingActive && shouldShowOverlay()) {
    if (modeOverlayTimer) {
      clearTimeout(modeOverlayTimer);
      modeOverlayTimer = null;
    }
    try {
      await platformAdapter.overlay.show('done');
      await platformAdapter.overlay.setText('Mode switched');
      modeOverlayTimer = setTimeout(() => {
        platformAdapter.overlay.hide().catch(() => undefined);
        modeOverlayTimer = null;
      }, 2000);
    } catch {
      // ignore overlay errors
    }
  }
  const win = getMainWindow();
  if (win && !win.isVisible()) {
    try {
      win.show();
    } catch (error) {
      recordError(error);
    }
  }
};

const attachLocalHotkeys = (win: BrowserWindow) => {
  if (hotkeyAttached) return;
  hotkeyAttached = true;
  win.webContents.on('before-input-event', (event, input) => {
    if (input.isAutoRepeat) return;
    const shouldHandleLocalPushToTalk = process.platform !== 'darwin';
    if (input.type === 'keyDown' || input.type === 'keyUp') {
      if (input.type === 'keyDown' && matchesShortcut(input, settings.toggleRecordingKey)) {
        event.preventDefault();
        triggerToggleRecording();
        return;
      }
      if (shouldHandleLocalPushToTalk && matchesShortcut(input, settings.pushToTalkKey)) {
        event.preventDefault();
        handlePushToTalkActive(input.type === 'keyDown');
      } else if (input.type === 'keyDown' && matchesShortcut(input, settings.changeModeShortcut)) {
        event.preventDefault();
        void cycleActiveMode();
      } else if (input.type === 'keyDown' && matchesShortcut(input, settings.cancelKey)) {
        event.preventDefault();
        void cancelRecording();
      }
    }
  });
};

const registerGlobalShortcut = (accelerator: string | undefined, handler: () => void) => {
  if (!accelerator) return;
  try {
    if (globalShortcut.register(accelerator, handler)) {
      suppressionHotkeys.add(accelerator);
    }
  } catch (error) {
    recordError(error);
  }
};

const triggerToggleRecording = () => {
  if (recordingActive) {
    void stopRecording();
  } else {
    void startRecording();
  }
};

const registerHotkeys = async () => {
  if (!hotkeysEnabled) return;
  suppressionHotkeys.forEach((key) => globalShortcut.unregister(key));
  suppressionHotkeys.clear();
  try {
    await hotkeyHandle?.unregister();
  } catch (error) {
    recordError(error);
  }
  try {
    await cancelHandle?.unregister();
  } catch (error) {
    recordError(error);
  }
  try {
    await toggleHandle?.unregister();
  } catch (error) {
    recordError(error);
  }
  try {
    await changeModeHandle?.unregister();
  } catch (error) {
    recordError(error);
  }
  changeModeHandle = null;
  try {
    hotkeyHandle = await platformAdapter.hotkey.registerHotkey(
      { key: settings.pushToTalkKey, action: 'hold' },
      (active) => handlePushToTalkActive(active)
    );
  } catch (error) {
    recordError(error);
    hotkeyHandle = null;
  }

  // Hold-to-talk must stay on the low-level hook only. Electron global shortcuts
  // do not expose key-up, so a fallback here degrades into toggle behavior.

  // These actions are edge-triggered and work reliably with Electron's global shortcuts.
  registerGlobalShortcut(settings.toggleRecordingKey, () => {
    triggerToggleRecording();
  });
  registerGlobalShortcut(settings.changeModeShortcut, () => {
    void cycleActiveMode();
  });
  registerGlobalShortcut(settings.cancelKey, () => {
    void cancelRecording();
  });

  toggleHandle = null;
  cancelHandle = null;
  return;
};

const createTranscriptionClientForSettings = () => {
  const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1/audio';
  const apiKey = settings.openAiApiKey ?? process.env.OPENAI_API_KEY;
  return createTranscriptionClient({
    baseUrl,
    apiKey,
    fetcher: fetch,
    websocketFactory: (url) => {
      const headers: Record<string, string> = { 'OpenAI-Beta': 'realtime=v1' };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      return new WebSocket(url, { headers }) as unknown as WebSocketLike;
    },
  });
};

const resolveOpenAIResponsesUrl = (baseUrl: string) => {
  const v1Index = baseUrl.indexOf('/v1');
  if (v1Index >= 0) {
    return `${baseUrl.slice(0, v1Index + 3)}/responses`;
  }
  const trimmed = baseUrl.replace(/\/$/, '');
  return `${trimmed}/v1/responses`;
};

const extractOutputText = (data: unknown): string | null => {
  if (!data || typeof data !== 'object') return null;
  const outputText = (data as { output_text?: unknown }).output_text;
  if (typeof outputText === 'string') return outputText;
  const output = (data as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  const parts: string[] = [];
  output.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) return;
    content.forEach((part) => {
      if (!part || typeof part !== 'object') return;
      const text = (part as { text?: unknown }).text;
      if (typeof text === 'string') {
        parts.push(text);
      }
    });
  });
  return parts.length ? parts.join('') : null;
};

const createRewriteClientForSettings = () => {
  const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1/audio';
  const apiKey = settings.openAiApiKey ?? process.env.OPENAI_API_KEY;
  const url = resolveOpenAIResponsesUrl(baseUrl);
  return async (text: string, prompt: string) => {
    if (!prompt.trim()) return text;
    if (!apiKey) throw new Error('OpenAI API key is required for rewrite prompts.');
    const instructions = [
      'Rewrite the input text according to the instructions below.',
      'Return only the rewritten text. Do not add quotes or commentary.',
      '',
      'Instructions:',
      prompt.trim(),
    ].join('\n');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        instructions,
        input: text,
        temperature: 0.2,
      }),
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Rewrite failed: ${response.status} ${details}`);
    }
    const data = (await response.json()) as unknown;
    const output = extractOutputText(data);
    return output ?? text;
  };
};

const createStatsSummaryClientForSettings = () => {
  const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const apiKey = settings.openAiApiKey ?? process.env.OPENAI_API_KEY;
  const url = resolveOpenAIResponsesUrl(baseUrl);
  return async (payload: ReturnType<typeof StatsSummaryRequestSchema.parse>) => {
    if (!apiKey) {
      return StatsSummaryResponseSchema.parse({ summary: null, source: 'unavailable' });
    }
    const instructions = [
      'You are a concise, friendly productivity coach for dictation stats.',
      'Write 1-2 short sentences (max 45 words).',
      'Be encouraging but include a gentle nudge to improve when possible.',
      'Mention 1-2 concrete metrics. No bullets, no markdown.',
      'Anchor the summary on the latest period first, then the short-term trend.',
      'Do not praise consistency or momentum unless the latest period supports it.',
      'Vary phrasing from call to call. You may include at most one emoji.',
    ].join(' ');
    const styleHints = [
      'Warm and upbeat.',
      'Calm and supportive.',
      'Friendly coach tone.',
      'Encouraging and light.',
    ];
    const styleHint = styleHints[Math.floor(Math.random() * styleHints.length)];
    const promptInput = buildStatsSummaryPromptInput(payload, styleHint);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        instructions,
        input: JSON.stringify(promptInput),
        temperature: 0.65,
        max_output_tokens: 120,
      }),
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Stats summary failed: ${response.status} ${details}`);
    }
    const data = (await response.json()) as unknown;
    const output = extractOutputText(data);
    return StatsSummaryResponseSchema.parse({ summary: output ?? null, source: 'openai' });
  };
};

const pipelineContext = {
  settings: settings as Settings,
  vocabulary,
  shortcuts,
  mode: undefined as (typeof modes)[number] | undefined,
};

const settingsForRenderer = (value: Settings): Settings =>
  // Renderer only needs to know if a key exists, never the secret itself.
  maskApiKeyForRenderer(value);

const updatePipelineContext = () => {
  pipelineContext.settings = settings as Settings;
  pipelineContext.mode = modes.find((mode) => mode.id === settings.activeModeId);
  const scope = pipelineContext.mode?.vocabularySetIds ?? ['global', 'mode'];
  const includeGlobal = scope.includes('global');
  const includeMode = scope.includes('mode');
  pipelineContext.vocabulary = vocabulary.filter((entry) => {
    if (!entry.modeId) return includeGlobal;
    return includeMode && entry.modeId === settings.activeModeId;
  });
  pipelineContext.shortcuts = shortcuts.filter((entry) => {
    if (!entry.modeId) return true;
    return entry.modeId === settings.activeModeId;
  });
};

const persistState = () => {
  saveState({
    history,
    modes,
    vocabulary,
    shortcuts,
    settings: stripApiKeyFromSettings(settings),
  });
};

const initSpeechSession = () => {
  updatePipelineContext();
  speechSession = createSpeechToTextSession({
    transcription: createTranscriptionClientForSettings(),
    rewriteText: createRewriteClientForSettings(),
    insertText: async (text: string) => {
      const behavior = pipelineContext.mode?.insertionBehavior ?? 'insert';
      if (behavior === 'clipboard') {
        return { success: false, method: 'clipboard' };
      }
      if (recordingTargetAppName && !isSusurrareAppName(recordingTargetAppName)) {
        let activeAppName: string | null = null;
        try {
          activeAppName = await platformAdapter.app.activeName();
        } catch {
          activeAppName = null;
        }
        if (isSusurrareAppName(activeAppName)) {
          const restored = await activateAppByName(recordingTargetAppName);
          if (restored) {
            await pause(90);
          }
        }
      }
      const shouldRestore = settings.restoreClipboardAfterPaste ?? false;
      let previousClipboard: string | null = null;
      if (shouldRestore) {
        try {
          previousClipboard = await platformAdapter.clipboard.get();
        } catch {
          previousClipboard = null;
        }
      }
      let result = await platformAdapter.insertText.atCursor(text);
      if (!result.success && recordingTargetAppName && !isSusurrareAppName(recordingTargetAppName)) {
        let activeAppName: string | null = null;
        try {
          activeAppName = await platformAdapter.app.activeName();
        } catch {
          activeAppName = null;
        }
        if (!isSameAppName(activeAppName, recordingTargetAppName)) {
          const restored = await activateAppByName(recordingTargetAppName);
          if (restored) {
            await pause(90);
            result = await platformAdapter.insertText.atCursor(text);
          }
        }
      }
      if (
        shouldRestore &&
        result.success &&
        result.method === 'accessibility' &&
        previousClipboard !== null
      ) {
        try {
          await pause(160);
          await platformAdapter.clipboard.set(previousClipboard);
        } catch {
          // ignore clipboard restore failures
        }
      }
      if (!result.success && result.method === 'clipboard') {
        sendRecordingStatus(
          'error',
          'Could not paste into the target app. Text was copied to the clipboard. Grant Accessibility and Automation access to Electron and allow control of System Events.'
        );
      }
      return result;
    },
    clipboard: (text: string) => platformAdapter.clipboard.set(text),
    history: {
      add: async (item) => {
        let appName: string | null = null;
        try {
          appName = await platformAdapter.app.activeName();
        } catch {
          appName = null;
        }
        const parsed = HistoryItemSchema.parse({ ...item, appName: appName ?? undefined });
        history.unshift(parsed);
        persistState();
        sendHistoryUpdated();
      },
    },
    pipelineContext,
  });
  speechSession.onEvent((event) => {
    const win = getMainWindow();
    if (!win) return;
    try {
      if (win.webContents.isDestroyed()) return;
      if (event.type === 'partialTranscript') {
        win.webContents.send(
          IpcChannels.transcriptionEvent,
          wrapEnvelope({ kind: 'partial', text: event.text, timestamp: event.timestamp })
        );
        if (shouldShowOverlay() && recordingActive && event.text !== lastOverlayPartial) {
          lastOverlayPartial = event.text;
          platformAdapter.overlay.setText(event.text).catch(() => undefined);
        }
      }
      if (event.type === 'finalTranscript') {
        win.webContents.send(
          IpcChannels.transcriptionEvent,
          wrapEnvelope({ kind: 'final', text: event.text, timestamp: Date.now() })
        );
        if (shouldShowOverlay()) {
          lastOverlayPartial = '';
          platformAdapter.overlay.setText('').catch(() => undefined);
        }
      }
      if (event.type === 'error' && event.code === 'streaming_unavailable') {
        if (shouldShowOverlay() && recordingActive && streamingEnabled) {
          // Keep recording flow stable and silently rely on HTTP finalization fallback.
          lastOverlayPartial = 'Listening…';
          platformAdapter.overlay.setText('Listening…').catch(() => undefined);
        }
      }
    } catch (error) {
      recordError(error);
    }
  });
};

ipcMain.handle(IpcChannels.recordingCommand, async (_event, envelope) => {
  if (!envelope || envelope.version !== IPC_VERSION) return;
  const command = RecordingCommandSchema.parse(envelope.payload);
  if (command === 'start') {
    await startRecording();
    return wrapEnvelope({ ok: true });
  }
  if (command === 'stop') {
    await stopRecording();
    return wrapEnvelope({ ok: true });
  }
  // cancel
  await cancelRecording();
  return wrapEnvelope({ ok: true });
});

ipcMain.handle(IpcChannels.insertAction, async (_event, envelope) => {
  if (!envelope || envelope.version !== IPC_VERSION) return;
  const payload = InsertActionSchema.parse(envelope.payload);
  if (payload.mode === 'paste') {
    const result = await platformAdapter.insertText.atCursor(payload.text);
    if (!result.success) {
      await platformAdapter.clipboard.set(payload.text);
    }
  } else {
    await platformAdapter.clipboard.set(payload.text);
  }
  return wrapEnvelope({ ok: true });
});

ipcMain.handle(IpcChannels.historyList, async () => {
  return wrapEnvelope(history.map((item) => HistoryItemSchema.parse(item)));
});

ipcMain.handle(IpcChannels.historyAdd, async (_event, envelope) => {
  if (!envelope || envelope.version !== IPC_VERSION) return;
  const item = HistoryItemSchema.parse(sanitizeHistoryPayload(envelope.payload));
  history.unshift(item);
  persistState();
  sendHistoryUpdated();
  return wrapEnvelope({ ok: true });
});

ipcMain.handle(IpcChannels.historyDelete, async (_event, envelope) => {
  if (!envelope || envelope.version !== IPC_VERSION) return;
  const id = String(envelope.payload);
  const index = history.findIndex((item) => item.id === id);
  if (index >= 0) history.splice(index, 1);
  persistState();
  sendHistoryUpdated();
  return wrapEnvelope({ ok: true });
});

ipcMain.handle(IpcChannels.historyPin, async (_event, envelope) => {
  if (!envelope || envelope.version !== IPC_VERSION) return;
  const payload = HistoryPinSchema.parse(envelope.payload);
  const item = history.find((entry) => entry.id === payload.id);
  if (item) {
    item.pinned = payload.pinned;
    persistState();
    sendHistoryUpdated();
  }
  return wrapEnvelope({ ok: true });
});

ipcMain.handle(IpcChannels.historyExport, async (_event, envelope) => {
  if (!envelope || envelope.version !== IPC_VERSION) return;
  const payload = HistoryExportSchema.parse(envelope.payload);
  const selected = history.filter((item) => payload.ids.includes(item.id));
  const content = selected.map((item) => item.text).join('\n\n');
  const filePath = join(app.getPath('documents'), `susurrare-history-${Date.now()}.txt`);
  writeFileSync(filePath, content, 'utf-8');
  return wrapEnvelope({ filePath });
});

ipcMain.handle(IpcChannels.settingsGet, async () => {
  return wrapEnvelope(settingsForRenderer(settings));
});

ipcMain.handle(IpcChannels.permissionsGet, async () => {
  return wrapEnvelope(await platformAdapter.permissions.check());
});

ipcMain.handle(IpcChannels.permissionsGuidance, async () => {
  return wrapEnvelope({ message: await platformAdapter.permissions.requestGuidance() });
});

ipcMain.handle(IpcChannels.settingsSet, async (_event, envelope) => {
  if (!envelope || envelope.version !== IPC_VERSION) return;
  const rawPayload = isRecord(envelope.payload) ? envelope.payload : {};
  const hasApiKeyUpdate = Object.prototype.hasOwnProperty.call(rawPayload, 'openAiApiKey');
  const sanitizedPayload = sanitizeSettingsPayload(rawPayload);
  let nextSettings = SettingsSchema.parse({ ...settings, ...sanitizedPayload });

  if (hasApiKeyUpdate) {
    const nextApiKey = sanitizedPayload.openAiApiKey;
    if (typeof nextApiKey === 'string' && nextApiKey.length > 0) {
      try {
        await saveOpenAiApiKey(nextApiKey);
      } catch (error) {
        recordError(error);
        throw new Error('Unable to save OpenAI API key to secure storage.');
      }
      nextSettings = SettingsSchema.parse({ ...nextSettings, openAiApiKey: nextApiKey });
    } else {
      try {
        await deleteOpenAiApiKey();
      } catch (error) {
        recordError(error);
        throw new Error('Unable to delete OpenAI API key from secure storage.');
      }
      nextSettings = SettingsSchema.parse({ ...nextSettings, openAiApiKey: undefined });
    }
  }

  settings = nextSettings;
  updatePipelineContext();
  persistState();
  initSpeechSession();
  await registerHotkeys();
  applyLoginItemSettings();
  applyThemeSource();
  updateTrayIcon();
  if (!shouldShowOverlay()) {
    platformAdapter.overlay.hide().catch(() => undefined);
  }
  scheduleUpdateChecks();
  return wrapEnvelope(settingsForRenderer(settings));
});

ipcMain.handle(IpcChannels.helpOpen, async (_event, envelope) => {
  const sectionId =
    envelope && envelope.version === IPC_VERSION
      ? isRecord(envelope.payload)
        ? sanitizeHelpSectionId((envelope.payload as JsonRecord).sectionId)
        : sanitizeHelpSectionId(envelope.payload)
      : null;
  const ok = await openHelpPage(sectionId);
  return wrapEnvelope({ ok });
});

ipcMain.handle(IpcChannels.appInfo, async () => {
  return wrapEnvelope(
    AppInfoSchema.parse({
      name: app.getName(),
      version: app.getVersion(),
    })
  );
});

ipcMain.handle(IpcChannels.modesList, async () => {
  return wrapEnvelope(modes.map((mode) => ModeSchema.parse(mode)));
});

ipcMain.handle(IpcChannels.modesSave, async (_event, envelope) => {
  if (!envelope || envelope.version !== IPC_VERSION) return;
  const now = Date.now();
  const payload = sanitizeModePayload(envelope.payload);
  const mode = ModeSchema.parse({
    ...payload,
    createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : now,
    updatedAt: now,
  });
  const index = modes.findIndex((item) => item.id === mode.id);
  if (index >= 0) modes[index] = mode;
  else modes.unshift(mode);
  if (!modes.find((item) => item.id === 'default')) {
    modes.push(
      ModeSchema.parse({
        id: 'default',
        name: 'Default',
        punctuationCommandsEnabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
  }
  if (!modes.find((item) => item.id === settings.activeModeId)) {
    settings = SettingsSchema.parse({ ...settings, activeModeId: 'default' });
  }
  updatePipelineContext();
  persistState();
  return wrapEnvelope(mode);
});

ipcMain.handle(IpcChannels.modesDelete, async (_event, envelope) => {
  if (!envelope || envelope.version !== IPC_VERSION) return;
  const id = String(envelope.payload);
  modes = modes.filter((mode) => mode.id !== id || mode.id === 'default');
  if (!modes.find((item) => item.id === settings.activeModeId)) {
    settings = SettingsSchema.parse({ ...settings, activeModeId: 'default' });
  }
  updatePipelineContext();
  persistState();
  return wrapEnvelope({ ok: true });
});

ipcMain.handle(IpcChannels.vocabularyList, async () => {
  return wrapEnvelope(vocabulary.map((entry) => VocabularyEntrySchema.parse(entry)));
});

ipcMain.handle(IpcChannels.vocabularySave, async (_event, envelope) => {
  if (!envelope || envelope.version !== IPC_VERSION) return;
  const now = Date.now();
  const payload = sanitizeVocabularyPayload(envelope.payload);
  const entry = VocabularyEntrySchema.parse({
    ...payload,
    createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : now,
    updatedAt: now,
  });
  const index = vocabulary.findIndex((item) => item.id === entry.id);
  if (index >= 0) vocabulary[index] = entry;
  else vocabulary.unshift(entry);
  updatePipelineContext();
  persistState();
  return wrapEnvelope(entry);
});

ipcMain.handle(IpcChannels.vocabularyDelete, async (_event, envelope) => {
  if (!envelope || envelope.version !== IPC_VERSION) return;
  const id = String(envelope.payload);
  const index = vocabulary.findIndex((item) => item.id === id);
  if (index >= 0) vocabulary.splice(index, 1);
  updatePipelineContext();
  persistState();
  return wrapEnvelope({ ok: true });
});

ipcMain.handle(IpcChannels.shortcutsList, async () => {
  return wrapEnvelope(shortcuts.map((entry) => ShortcutEntrySchema.parse(entry)));
});

ipcMain.handle(IpcChannels.shortcutsSave, async (_event, envelope) => {
  if (!envelope || envelope.version !== IPC_VERSION) return;
  const now = Date.now();
  const payload = sanitizeShortcutPayload(envelope.payload);
  const entry = ShortcutEntrySchema.parse({
    ...payload,
    createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : now,
    updatedAt: now,
  });
  const index = shortcuts.findIndex((item) => item.id === entry.id);
  if (index >= 0) shortcuts[index] = entry;
  else shortcuts.unshift(entry);
  updatePipelineContext();
  persistState();
  return wrapEnvelope(entry);
});

ipcMain.handle(IpcChannels.shortcutsDelete, async (_event, envelope) => {
  if (!envelope || envelope.version !== IPC_VERSION) return;
  const id = String(envelope.payload);
  const index = shortcuts.findIndex((item) => item.id === id);
  if (index >= 0) shortcuts.splice(index, 1);
  updatePipelineContext();
  persistState();
  return wrapEnvelope({ ok: true });
});

ipcMain.handle(IpcChannels.modelsList, async () => {
  return wrapEnvelope(models);
});

ipcMain.handle(IpcChannels.diagnosticsExport, async () => {
  const startedAt = Date.now();
  const { filePath } = await exportDiagnostics();
  const exportResult = DiagnosticsExportSchema.parse({
    startedAt,
    finishedAt: Date.now(),
    filePath,
  });
  return wrapEnvelope(exportResult);
});

ipcMain.handle(IpcChannels.updateCheck, async () => {
  try {
    configureAutoUpdater();
    const result = await autoUpdater.checkForUpdates();
    return wrapEnvelope({ status: 'checked', info: result?.updateInfo ?? null });
  } catch (error) {
    recordError(error);
    return wrapEnvelope({ status: 'error', message: error instanceof Error ? error.message : String(error) });
  }
});

ipcMain.handle(IpcChannels.statsSummary, async (_event, envelope) => {
  if (!envelope || envelope.version !== IPC_VERSION) return;
  try {
    const payload = StatsSummaryRequestSchema.parse(envelope.payload);
    const generate = createStatsSummaryClientForSettings();
    const result = await generate(payload);
    return wrapEnvelope(result);
  } catch (error) {
    recordError(error);
    return wrapEnvelope(StatsSummaryResponseSchema.parse({ summary: null, source: 'error' }));
  }
});

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
  log.initialize();
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.on('error', (error: unknown) => {
    recordError(error);
  });
  autoUpdater.on('update-available', () => {
    log.info('Update available');
  });
  autoUpdater.on('update-not-available', () => {
    log.info('No update available');
  });
  const state = loadState();
  history = state.history;
  modes = state.modes;
  vocabulary = state.vocabulary;
  shortcuts = state.shortcuts ?? [];
  const persistedApiKey = state.settings.openAiApiKey?.trim() || undefined;
  let storedApiKey: string | undefined;
  try {
    storedApiKey = (await loadOpenAiApiKey()) ?? undefined;
  } catch (error) {
    recordError(error);
  }
  if (!storedApiKey && persistedApiKey) {
    try {
      await saveOpenAiApiKey(persistedApiKey);
      storedApiKey = persistedApiKey;
    } catch (error) {
      // Preserve this session's behavior if migration to secure storage fails.
      recordError(error);
      storedApiKey = persistedApiKey;
    }
  }
  settings = SettingsSchema.parse({
    ...state.settings,
    openAiApiKey: storedApiKey ?? persistedApiKey,
  });
  if (persistedApiKey) {
    persistState();
  }
  preloadSoundEffects();
  warmSoundPlayer({ force: true });
  scheduleSoundWarmMaintenance();
  if (process.platform === 'darwin') {
    powerMonitor.on('resume', () => warmSoundPlayer({ force: true }));
    powerMonitor.on('unlock-screen', () => warmSoundPlayer({ force: true }));
  }
  updatePipelineContext();
  initSpeechSession();
  applyThemeSource();
  void registerHotkeys();
  applyLoginItemSettings();
  configureAutoUpdater();
  scheduleUpdateChecks();
  if (!recordingActive && shouldShowOverlay()) {
    await platformAdapter.overlay.show('idle').catch(() => undefined);
  }
  createWindow();
  if (!recordingActive && !shouldShowOverlay()) {
    platformAdapter.overlay.hide().catch(() => undefined);
  }
  createTray();
  nativeTheme.on('updated', updateTrayIcon);
  sendHistoryUpdated();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    if (!recordingActive) {
      if (shouldShowOverlay()) {
        platformAdapter.overlay.show('idle').catch(() => undefined);
      } else {
        platformAdapter.overlay.hide().catch(() => undefined);
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
