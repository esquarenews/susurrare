import { createRequire } from 'module';
import { execFile } from 'child_process';
import { BrowserWindow, clipboard, screen, systemPreferences } from 'electron';
import {
  getOverlayStatusLabel,
  isOverlayDraggableState,
  mapWaveToVocsenOverlayLevels,
  shouldRequireVisibleWindowForOverlayChannel,
  type PlatformAdapter,
} from '@susurrare/platform';

type RecordModule = {
  record: (options?: {
    sampleRate?: number;
    channels?: number;
    threshold?: number;
    verbose?: boolean;
    audioType?: string;
  }) => { stop(): void; stream(): NodeJS.ReadableStream };
};

const require = createRequire(import.meta.url);
const record = require('node-record-lpcm16') as RecordModule;

type IOHookEvent = {
  keycode: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
};

type IOHook = {
  on(event: 'keydown' | 'keyup', callback: (event: IOHookEvent) => void): void;
  start(): void;
  stop(): void;
};

type UiohookModule = {
  uIOhook: IOHook;
  UiohookKey: Record<string, number>;
};

let uiohookModule: UiohookModule | null = null;
let accessibilityPromptAttempted = false;

const hasAccessibilityAccess = () => systemPreferences.isTrustedAccessibilityClient(false);

const requireAccessibilityAccess = (prompt = false) => {
  if (hasAccessibilityAccess()) return;
  if (prompt && !accessibilityPromptAttempted) {
    accessibilityPromptAttempted = true;
    systemPreferences.isTrustedAccessibilityClient(true);
    if (hasAccessibilityAccess()) return;
  }
  throw new Error(
    'Accessibility access is required for low-level hotkeys on macOS. Open System Settings > Privacy & Security > Accessibility and Input Monitoring, then grant access to Electron.'
  );
};

const mapMicrophoneAccess = () => {
  const status = systemPreferences.getMediaAccessStatus('microphone');
  switch (status) {
    case 'granted':
      return 'granted' as const;
    case 'denied':
    case 'restricted':
      return 'denied' as const;
    default:
      return 'prompt' as const;
  }
};

const loadUiohook = (): UiohookModule => {
  if (uiohookModule) return uiohookModule;
  let loaded: UiohookModule;
  try {
    loaded = require('uiohook-napi') as UiohookModule;
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `uiohook-napi failed to load. Rebuild it for Electron (pnpm dlx electron-rebuild -f -w uiohook-napi). ${details}`
    );
  }
  uiohookModule = loaded;
  return loaded;
};

type HotkeyRegistration = {
  keycode: number;
  modifiers: {
    shift: boolean;
    control: boolean;
    alt: boolean;
    meta: boolean;
  };
  action: 'hold' | 'toggle';
  listener: (active: boolean) => void;
  active: boolean;
};

const registrations = new Set<HotkeyRegistration>();
let hookStarted = false;
let hookAttached = false;

const startHook = () => {
  if (hookStarted) return;
  requireAccessibilityAccess(true);
  loadUiohook().uIOhook.start();
  hookStarted = true;
};

const stopHook = () => {
  if (!hookStarted) return;
  loadUiohook().uIOhook.stop();
  hookStarted = false;
};

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const runOsaScript = (script: string) =>
  new Promise<void>((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-e', script], (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

const normalizeShortcut = (shortcut: string) => {
  const tokens = shortcut
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean);
  const modifiers = new Set(tokens.map((token) => token.toLowerCase()));
  const mainKey = tokens[tokens.length - 1]?.toLowerCase() ?? '';
  return { modifiers, mainKey };
};

const resolveKeycode = (key: string) => {
  const normalized = key.replace(/\s+/g, '').toUpperCase();
  const aliases: Record<string, string> = {
    ESC: 'Escape',
    ESCAPE: 'Escape',
    RETURN: 'Enter',
    ENTER: 'Enter',
    SPACE: 'Space',
    TAB: 'Tab',
    BACKSPACE: 'Backspace',
    DELETE: 'Delete',
    DEL: 'Delete',
  };
  const candidate =
    (loadUiohook().UiohookKey as Record<string, number>)[normalized] ??
    (aliases[normalized]
      ? (loadUiohook().UiohookKey as Record<string, number>)[aliases[normalized]]
      : undefined);
  if (candidate === undefined) {
    throw new Error(`Unsupported hotkey: ${key}`);
  }
  return candidate;
};

const matchesRegistration = (
  event: {
    keycode: number;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  },
  registration: HotkeyRegistration
) => {
  if (event.keycode !== registration.keycode) return false;
  if (event.shiftKey !== registration.modifiers.shift) return false;
  if (event.ctrlKey !== registration.modifiers.control) return false;
  if (event.altKey !== registration.modifiers.alt) return false;
  if (event.metaKey !== registration.modifiers.meta) return false;
  return true;
};

const ensureHookHandlers = () => {
  if (hookAttached) return;
  hookAttached = true;
  loadUiohook().uIOhook.on('keydown', (event) => {
    registrations.forEach((registration) => {
      if (!matchesRegistration(event, registration)) return;
      if (registration.action === 'hold') {
        if (!registration.active) {
          registration.active = true;
          registration.listener(true);
        }
        return;
      }
      registration.active = !registration.active;
      registration.listener(registration.active);
    });
  });
  loadUiohook().uIOhook.on('keyup', (event) => {
    registrations.forEach((registration) => {
      if (registration.action !== 'hold') return;
      if (!registration.active) return;
      if (!matchesRegistration(event, registration)) return;
      registration.active = false;
      registration.listener(false);
    });
  });
};

const DEFAULT_SAMPLE_RATE = 16000;
const STREAM_FRAME_MS = 10;
let currentRecording:
  | {
      recorder: { stop: () => void };
      stream: NodeJS.ReadableStream;
      iterable: AsyncIterable<{ data: Uint8Array; timestamp: number }>;
      chunks: Uint8Array[];
      totalBytes: number;
      autoGainEnabled: boolean;
      gain: number;
      sampleRate: number;
      stopped: Promise<void>;
      resolveStopped: () => void;
    }
  | null = null;

let overlayWindow: BrowserWindow | null = null;
let overlayState: 'recording' | 'processing' | 'done' = 'recording';
let overlayText = '';
let overlayMode = '';
let overlayReady = false;
let overlayLoadPromise: Promise<void> | null = null;
let resolveOverlayLoad: (() => void) | null = null;
let pendingOverlayLevels: number[] | null = null;
let overlayLevelsFlushScheduled = false;
let overlayLevelsFlushInFlight = false;
const hasPendingOverlayLevels = () =>
  Array.isArray(pendingOverlayLevels) && pendingOverlayLevels.length > 0;

const overlayHtml = () => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      :root {
        color-scheme: dark;
      }
      html,
      body {
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: transparent;
        color: #b7ffcc;
        width: 100%;
        height: 100%;
        overflow: hidden;
        transition: color 0.35s ease;
      }
      body[data-state='recording'] {
        color: #b7ffcc;
      }
      body[data-state='processing'] {
        color: #6aa7ff;
      }
      body[data-state='done'] {
        color: #a57bff;
      }
      .wrap {
        width: 100%;
        height: 100%;
        padding: 10px 18px 12px;
        box-sizing: border-box;
        display: grid;
        gap: 4px;
        align-content: start;
        justify-items: center;
        background: rgba(10, 14, 18, 0.7);
        border: 1px solid rgba(124, 255, 176, 0.28);
        border-radius: 24px;
        backdrop-filter: blur(12px);
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
        transition: border-color 0.35s ease, box-shadow 0.35s ease;
        -webkit-app-region: no-drag;
      }
      .mode {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        opacity: 0.82;
        transition: opacity 0.35s ease;
      }
      .mode[data-empty='true'] {
        opacity: 0;
        height: 0;
        margin: 0;
      }
      .mode.pulse {
        animation: modePulse 0.7s ease;
      }
      .wave-wrap {
        width: 108px;
        height: 72px;
        display: grid;
        place-items: center;
      }
      .vocsen-meter {
        display: block;
        width: 88px;
        height: 68px;
        overflow: visible;
        transition: filter 0.35s ease, opacity 0.35s ease;
      }
      .vocsen-bar {
        fill: none;
        stroke: url(#vocsen-gradient);
        stroke-width: 4px;
        stroke-linecap: round;
        vector-effect: non-scaling-stroke;
        transition: opacity 0.2s ease;
      }
      .status {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.22em;
        transition: color 0.35s ease;
      }
      .meta {
        width: 100%;
        max-width: 360px;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 16px;
        min-height: 16px;
      }
      .timer {
        font-size: 11px;
        letter-spacing: 0.14em;
        font-variant-numeric: tabular-nums;
        opacity: 0.85;
      }
      .timer[data-visible='false'] {
        display: none;
      }
      .partial {
        font-size: 12.5px;
        line-height: 1.35;
        letter-spacing: 0.01em;
        opacity: 0.7;
        width: 100%;
        justify-self: stretch;
        max-width: 360px;
        max-height: calc(1.35em * 2.7);
        min-height: 0;
        white-space: normal;
        overflow-y: auto;
        text-overflow: unset;
        text-align: center;
        scrollbar-width: none;
        transition: opacity 0.2s ease, max-height 0.2s ease;
      }
      .partial::-webkit-scrollbar {
        width: 0;
        height: 0;
      }
      .partial[data-empty='true'] {
        opacity: 0;
        max-height: 0;
        overflow: hidden;
      }
      body[data-state='recording'] .wrap {
        border-color: rgba(124, 255, 176, 0.35);
        box-shadow: 0 12px 30px rgba(10, 40, 20, 0.45);
        -webkit-app-region: drag;
        cursor: grab;
      }
      body[data-state='recording'] .vocsen-meter {
        filter: drop-shadow(0 0 12px rgba(124, 255, 176, 0.34));
      }
      body[data-state='recording'] .wrap:active {
        cursor: grabbing;
      }
      body[data-state='processing'] .wrap {
        border-color: rgba(106, 167, 255, 0.35);
        box-shadow: 0 12px 30px rgba(22, 40, 78, 0.45);
      }
      body[data-state='processing'] .vocsen-meter {
        filter: drop-shadow(0 0 12px rgba(106, 167, 255, 0.28));
      }
      body[data-state='processing'] .vocsen-bar {
        stroke: rgba(106, 167, 255, 0.94);
      }
      body[data-state='done'] .wrap {
        border-color: rgba(165, 123, 255, 0.4);
        box-shadow: 0 12px 30px rgba(54, 24, 96, 0.45);
      }
      body[data-state='done'] .vocsen-meter {
        filter: drop-shadow(0 0 12px rgba(165, 123, 255, 0.28));
      }
      body[data-state='done'] .vocsen-bar {
        stroke: rgba(165, 123, 255, 0.94);
      }
      body[data-state='done'] .partial,
      body[data-state='processing'] .partial {
        opacity: 0.35;
      }
      @keyframes modePulse {
        0% {
          opacity: 0.25;
          transform: translateY(-2px) scale(0.98);
        }
        40% {
          opacity: 1;
          transform: translateY(0) scale(1.02);
        }
        100% {
          opacity: 0.85;
          transform: translateY(0) scale(1);
        }
      }
    </style>
  </head>
  <body data-state="recording">
    <div class="wrap">
      <div class="mode" id="mode" data-empty="true"></div>
      <div class="wave-wrap">
        <svg class="vocsen-meter" viewBox="0 0 48 48" aria-hidden="true">
          <defs>
            <linearGradient id="vocsen-gradient" x1="0" y1="44.07" x2="0" y2="5.42" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#14b8a6" />
              <stop offset="50%" stop-color="#10b981" />
              <stop offset="100%" stop-color="#84cc16" />
            </linearGradient>
          </defs>
          <line class="vocsen-bar" id="vocsen-bar-0" x1="6.22" y1="44.07" x2="6.22" y2="5.42" />
          <line class="vocsen-bar" id="vocsen-bar-1" x1="13.23" y1="44.07" x2="13.23" y2="9.88" />
          <line class="vocsen-bar" id="vocsen-bar-2" x1="20.23" y1="44.07" x2="20.23" y2="16.86" />
          <line class="vocsen-bar" id="vocsen-bar-3" x1="27.46" y1="44.07" x2="27.46" y2="5.42" />
          <line class="vocsen-bar" id="vocsen-bar-4" x1="34.46" y1="44.07" x2="34.46" y2="9.88" />
          <line class="vocsen-bar" id="vocsen-bar-5" x1="41.46" y1="44.07" x2="41.46" y2="16.86" />
        </svg>
      </div>
      <div class="meta">
        <div class="timer" id="timer" data-visible="false">00:00</div>
        <div class="status" id="status">recording</div>
      </div>
      <div class="partial" id="partial" data-empty="true"></div>
    </div>
    <script>
      const statusEl = document.getElementById('status');
      const timerEl = document.getElementById('timer');
      const partialEl = document.getElementById('partial');
      const modeEl = document.getElementById('mode');
      const meterBarEls = Array.from({ length: 6 }, (_, index) =>
        document.getElementById(\`vocsen-bar-\${index}\`)
      );
      const meterBaseHeights = [38.65, 34.19, 27.21, 38.65, 34.19, 27.21];
      const meterProfile = [1, 0.8846, 0.704, 1, 0.8846, 0.704];
      const meterSeeds = [0.18, 0.54, 0.91, 1.27, 1.68, 2.03];
      const meterBaselineY = 44.07;
      const doneStatusLabel = ${JSON.stringify(getOverlayStatusLabel('done'))};
      const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
      let phase = 0;
      let state = 'idle';
      let meterTargets = Array(meterBarEls.length).fill(0);
      let meterDisplayed = Array(meterBarEls.length).fill(0);
      let partialText = '';
      let modeText = '';
      let timerAccumulatedMs = 0;
      let timerStartedAt = 0;
      let timerRunning = false;
      let timerVisible = false;
      let timerInterval = null;

      const formatTimer = (milliseconds) => {
        const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
      };

      const currentTimerValue = () =>
        timerRunning ? timerAccumulatedMs + (Date.now() - timerStartedAt) : timerAccumulatedMs;

      const syncTimer = () => {
        timerEl.textContent = formatTimer(currentTimerValue());
        timerEl.dataset.visible = timerVisible ? 'true' : 'false';
      };

      const stopTimer = () => {
        if (timerRunning) {
          timerAccumulatedMs += Date.now() - timerStartedAt;
          timerRunning = false;
        }
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
        syncTimer();
      };

      const startTimer = (reset) => {
        if (reset) {
          timerAccumulatedMs = 0;
          timerVisible = true;
        }
        if (!timerRunning) {
          timerStartedAt = Date.now();
          timerRunning = true;
        }
        if (!timerInterval) {
          timerInterval = setInterval(syncTimer, 200);
        }
        syncTimer();
      };

      const resetTimer = () => {
        stopTimer();
        timerAccumulatedMs = 0;
        timerVisible = false;
        syncTimer();
      };

      const setState = (next) => {
        const previous = state;
        state = next;
        statusEl.textContent = next === 'done' ? doneStatusLabel : next;
        document.body.dataset.state = next;
        if (next === 'recording') {
          timerVisible = true;
          startTimer(previous !== 'recording');
        } else if (next === 'processing') {
          timerVisible = true;
          stopTimer();
        } else if (next === 'idle') {
          resetTimer();
        } else {
          stopTimer();
        }
      };

      const setLevels = (next) => {
        if (!Array.isArray(next) || next.length === 0) return;
        meterTargets = meterBarEls.map((_, index) => {
          const value = next[index];
          if (typeof value !== 'number' || Number.isNaN(value)) return 0;
          return clamp(value, 0, 1);
        });
      };

      const setText = (text) => {
        const next = typeof text === 'string' ? text : '';
        partialText = next;
        partialEl.textContent = next;
        partialEl.dataset.empty = next ? 'false' : 'true';
        partialEl.scrollTop = partialEl.scrollHeight;
      };

      const setMode = (text) => {
        const next = typeof text === 'string' ? text : '';
        const changed = next && next !== modeText;
        modeText = next;
        modeEl.textContent = next ? \`Mode: \${next}\` : '';
        modeEl.dataset.empty = next ? 'false' : 'true';
        if (changed) {
          modeEl.classList.remove('pulse');
          void modeEl.offsetWidth;
          modeEl.classList.add('pulse');
        }
      };

      const resolveBarActivity = (index) => {
        if (state === 'recording') return meterDisplayed[index] ?? 0;
        if (state === 'processing') {
          return 0.18 + (Math.sin(phase * 0.36 + index * 0.82) + 1) * 0.08;
        }
        if (state === 'done') {
          return 0.12 + (Math.sin(phase * 0.22 + index * 0.58) + 1) * 0.03;
        }
        return 0;
      };

      const resolveRecordingTarget = (index) => {
        const current = meterTargets[index] ?? 0;
        const left = meterTargets[index - 1] ?? current;
        const right = meterTargets[index + 1] ?? current;
        const contour = current - (left + right) / 2;
        const ripple =
          Math.sin(phase * (0.88 + index * 0.04) + meterSeeds[index]) * (0.02 + current * 0.1);
        return clamp(current + contour * 0.22 + ripple, 0, 1);
      };

      const resolveBarScale = (index) => {
        const profile = meterProfile[index] ?? 0.8;
        const activity = resolveBarActivity(index);
        if (state === 'recording') {
          const response = Math.pow(activity, 0.84);
          const emphasis = 1 + ((index % 3) - 1) * 0.05;
          return clamp(0.14 + profile * 0.09 + response * 0.72 * emphasis, 0.14, 1);
        }
        if (state === 'processing') {
          return clamp(0.26 + profile * 0.16 + activity * 0.28, 0.18, 0.78);
        }
        if (state === 'done') {
          return clamp(0.22 + profile * 0.14 + activity * 0.22, 0.18, 0.68);
        }
        return clamp(0.12 + profile * 0.08, 0.1, 0.34);
      };

      const draw = () => {
        meterDisplayed = meterDisplayed.map((value, index) => {
          const target = state === 'recording' ? resolveRecordingTarget(index) : 0;
          const attack = state === 'recording' ? 0.82 + (index % 2) * 0.04 : 0.32;
          const release = state === 'recording' ? 0.28 + (index % 3) * 0.03 : 0.2;
          const smoothing = target > value ? attack : release;
          return clamp(value + (target - value) * smoothing, 0, 1);
        });

        meterBarEls.forEach((barEl, index) => {
          if (!barEl) return;
          const scale = resolveBarScale(index);
          const height = meterBaseHeights[index] * scale;
          const y2 = meterBaselineY - height;
          const activity = resolveBarActivity(index);
          const opacity =
            state === 'recording'
              ? 0.52 + activity * 0.48
              : state === 'processing'
              ? 0.7 + activity * 0.18
              : state === 'done'
              ? 0.62 + activity * 0.12
              : 0.42;
          barEl.setAttribute('y1', String(meterBaselineY));
          barEl.setAttribute('y2', y2.toFixed(2));
          barEl.style.opacity = String(clamp(opacity, 0.35, 1));
        });

        phase += state === 'recording' ? 0.18 : 0.12;
        requestAnimationFrame(draw);
      };

      window.__setOverlayState = setState;
      window.__setOverlayLevels = setLevels;
      window.__setOverlayText = setText;
      window.__setOverlayMode = setMode;
      syncTimer();
      draw();
    </script>
  </body>
</html>
`;

const syncOverlayInteractivity = () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const draggable = isOverlayDraggableState(overlayState);
  overlayWindow.setIgnoreMouseEvents(!draggable, { forward: !draggable });
};

const positionOverlayWindowAtDefault = () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const [width] = overlayWindow.getSize();
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const x = Math.round((screenWidth - width) / 2);
  const y = 24;
  overlayWindow.setPosition(x, y);
};

const waitForOverlayReady = async () => {
  if (overlayReady) return;
  try {
    await overlayLoadPromise;
  } catch {
    // ignore overlay lifecycle races
  }
};

const ensureOverlayWindow = () => {
  if (overlayWindow) return;
  const width = 420;
  overlayWindow = new BrowserWindow({
    width,
    height: 188,
    frame: false,
    resizable: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });
  syncOverlayInteractivity();
  overlayWindow.setOpacity(0);
  overlayReady = false;
  overlayLoadPromise = new Promise<void>((resolve) => {
    resolveOverlayLoad = resolve;
  });
  positionOverlayWindowAtDefault();
  overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayHtml())}`);
  overlayWindow.on('closed', () => {
    overlayWindow = null;
    overlayReady = false;
    overlayLoadPromise = null;
    resolveOverlayLoad = null;
    pendingOverlayLevels = null;
    overlayLevelsFlushScheduled = false;
    overlayLevelsFlushInFlight = false;
  });
  overlayWindow.webContents.on('did-finish-load', () => {
    overlayReady = true;
    resolveOverlayLoad?.();
    resolveOverlayLoad = null;
    if (overlayWindow && !overlayWindow.isDestroyed() && !overlayWindow.webContents.isDestroyed()) {
      overlayWindow.webContents
        .executeJavaScript(`window.__setOverlayState(${JSON.stringify(overlayState)})`)
        .catch(() => undefined);
      if (overlayText) {
        overlayWindow.webContents
          .executeJavaScript(`window.__setOverlayText(${JSON.stringify(overlayText)})`)
          .catch(() => undefined);
      }
      if (overlayMode) {
        overlayWindow.webContents
          .executeJavaScript(`window.__setOverlayMode(${JSON.stringify(overlayMode)})`)
          .catch(() => undefined);
      }
    }
  });
};

const updateOverlayState = async (state: 'recording' | 'processing' | 'done') => {
  overlayState = state;
  if (state !== 'recording') {
    pendingOverlayLevels = null;
  }
  syncOverlayInteractivity();
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (overlayWindow.webContents.isDestroyed()) return;
  if (!overlayReady) return;
  try {
    await overlayWindow.webContents.executeJavaScript(
      `window.__setOverlayState(${JSON.stringify(state)})`
    );
  } catch {
    return;
  }
  if (state !== 'recording') {
    try {
      await overlayWindow.webContents.executeJavaScript(`window.__setOverlayText('')`);
    } catch {
      // ignore overlay lifecycle races
    }
  }
};

const queueOverlayLevelsFlush = () => {
  if (overlayLevelsFlushScheduled) return;
  overlayLevelsFlushScheduled = true;
  queueMicrotask(() => {
    void flushOverlayLevels();
  });
};

const flushOverlayLevels = async () => {
  overlayLevelsFlushScheduled = false;
  if (overlayLevelsFlushInFlight) return;
  if (!hasPendingOverlayLevels()) return;
  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayReady) return;
  if (overlayWindow.webContents.isDestroyed()) return;
  if (overlayState !== 'recording') return;
  if (shouldRequireVisibleWindowForOverlayChannel('levels')) {
    try {
      if (!overlayWindow.isVisible()) return;
    } catch {
      return;
    }
  }

  const levels = pendingOverlayLevels;
  pendingOverlayLevels = null;
  overlayLevelsFlushInFlight = true;
  const script = `window.__setOverlayLevels(${JSON.stringify(levels)})`;
  try {
    await overlayWindow.webContents.executeJavaScript(script);
  } catch {
    // ignore overlay lifecycle races
  } finally {
    overlayLevelsFlushInFlight = false;
    if (hasPendingOverlayLevels()) {
      queueOverlayLevelsFlush();
    }
  }
};

const updateOverlayLevels = (levels: number[]) => {
  pendingOverlayLevels = levels;
  queueOverlayLevelsFlush();
};

const updateOverlayText = async (text: string) => {
  overlayText = text;
  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayReady) return;
  if (overlayWindow.webContents.isDestroyed()) return;
  if (shouldRequireVisibleWindowForOverlayChannel('text')) {
    try {
      if (!overlayWindow.isVisible()) return;
    } catch {
      return;
    }
  }
  const script = `window.__setOverlayText(${JSON.stringify(text)})`;
  try {
    await overlayWindow.webContents.executeJavaScript(script);
  } catch {
    // ignore overlay lifecycle races
  }
};

const updateOverlayMode = async (text: string) => {
  overlayMode = text;
  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayReady) return;
  if (overlayWindow.webContents.isDestroyed()) return;
  if (shouldRequireVisibleWindowForOverlayChannel('mode')) {
    try {
      if (!overlayWindow.isVisible()) return;
    } catch {
      return;
    }
  }
  const script = `window.__setOverlayMode(${JSON.stringify(text)})`;
  try {
    await overlayWindow.webContents.executeJavaScript(script);
  } catch {
    // ignore overlay lifecycle races
  }
};

const computeWaveform = (data: Uint8Array, bins = 32) => {
  if (data.length < 2) return new Array(bins).fill(0);
  const sums = new Array(bins).fill(0);
  const counts = new Array(bins).fill(0);
  const totalSamples = Math.floor(data.length / 2);
  for (let i = 0; i < totalSamples; i += 1) {
    const byteIndex = i * 2;
    const sample = data[byteIndex] | (data[byteIndex + 1] << 8);
    const signed = sample > 32767 ? sample - 65536 : sample;
    const normalized = signed / 32768;
    const bin = Math.min(bins - 1, Math.floor((i / totalSamples) * bins));
    sums[bin] += normalized;
    counts[bin] += 1;
  }
  return sums.map((sum, index) => {
    const count = counts[index];
    if (!count) return 0;
    const avg = sum / count;
    const amplified = Math.tanh(avg * 7);
    return Math.max(-1, Math.min(1, amplified));
  });
};

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

const applyGain = (data: Uint8Array, gain: number) => {
  if (gain === 1 || data.length < 2) return;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < data.length; i += 2) {
    const sample = view.getInt16(i, true);
    let scaled = Math.round(sample * gain);
    if (scaled > 32767) scaled = 32767;
    if (scaled < -32768) scaled = -32768;
    view.setInt16(i, scaled, true);
  }
};

const concatChunks = (chunks: Uint8Array[]) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  return merged;
};

export const macosAdapter: PlatformAdapter = {
  hotkey: {
    async registerHotkey(config, listener) {
      ensureHookHandlers();
      const { modifiers, mainKey } = normalizeShortcut(config.key);
      const registration: HotkeyRegistration = {
        keycode: resolveKeycode(mainKey),
        modifiers: {
          shift: modifiers.has('shift'),
          control: modifiers.has('ctrl') || modifiers.has('control'),
          alt: modifiers.has('alt') || modifiers.has('option'),
          meta: modifiers.has('cmd') || modifiers.has('command') || modifiers.has('meta'),
        },
        action: config.action,
        listener,
        active: false,
      };
      registrations.add(registration);
      startHook();
      return {
        async unregister() {
          registrations.delete(registration);
          if (registrations.size === 0) {
            stopHook();
          }
        },
      };
    },
  },
  audioCapture: {
    async start(options) {
      if (currentRecording) {
        return currentRecording.iterable;
      }
      const autoGainEnabled = options?.autoGain ?? false;
      const sampleRate = options?.sampleRate ?? DEFAULT_SAMPLE_RATE;
      const recorder = record.record({
        sampleRate,
        threshold: 0,
        verbose: false,
        channels: 1,
        audioType: 'raw',
      });
      const stream = recorder.stream();
      let resolveStopped = () => {};
      const stopped = new Promise<void>((resolve) => {
        resolveStopped = () => resolve();
      });
      stream.on('close', resolveStopped);
      stream.on('end', resolveStopped);
      stream.on('error', resolveStopped);
      const bytesPerFrame = Math.max(2, Math.round((sampleRate / 1000) * STREAM_FRAME_MS) * 2);
      let carry = Buffer.alloc(0);
      currentRecording = {
        recorder,
        stream,
        iterable: {
          async *[Symbol.asyncIterator]() {
            const emitFrame = async (frame: Uint8Array) => {
              const data = new Uint8Array(frame);
              const rawRms = computeRms(data);
              if (currentRecording?.autoGainEnabled) {
                const targetRms = 0.12;
                const desiredGain = rawRms > 0 ? targetRms / rawRms : 1;
                const clampedGain = Math.min(6, Math.max(0.35, desiredGain));
                const smoothed =
                  currentRecording.gain + (clampedGain - currentRecording.gain) * 0.12;
                currentRecording.gain = smoothed;
                applyGain(data, smoothed);
              }
              const durationMs = Math.round(
                (data.length / 2 / (currentRecording?.sampleRate ?? sampleRate)) * 1000
              );
              if (currentRecording) {
                currentRecording.chunks.push(data);
                currentRecording.totalBytes += data.length;
              }
              const wave = computeWaveform(data);
              const overlayLevels = mapWaveToVocsenOverlayLevels(wave);
              void updateOverlayLevels(overlayLevels);
              return { data, timestamp: Date.now(), durationMs, rms: rawRms };
            };

            for await (const chunk of stream as AsyncIterable<Buffer>) {
              const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
              const merged = carry.length ? Buffer.concat([carry, buffer]) : buffer;
              let offset = 0;
              while (offset + bytesPerFrame <= merged.length) {
                const frame = merged.subarray(offset, offset + bytesPerFrame);
                offset += bytesPerFrame;
                yield await emitFrame(frame);
              }
              carry = merged.subarray(offset);
            }
            if (carry.length) {
              yield await emitFrame(carry);
              carry = Buffer.alloc(0);
            }
          },
        },
        chunks: [],
        totalBytes: 0,
        autoGainEnabled,
        gain: 1,
        sampleRate,
        stopped,
        resolveStopped,
      };
      return currentRecording.iterable;
    },
    async stop() {
      if (!currentRecording) {
        return { data: new Uint8Array(), durationMs: 0 };
      }
      currentRecording.recorder.stop();
      await currentRecording.stopped;
      const data = concatChunks(currentRecording.chunks);
      const durationMs = Math.round(
        (data.length / 2 / currentRecording.sampleRate) * 1000
      );
      currentRecording = null;
      return { data, durationMs };
    },
    async cancel() {
      if (!currentRecording) return;
      currentRecording.recorder.stop();
      await currentRecording.stopped;
      currentRecording = null;
    },
  },
  insertText: {
    async atCursor(text: string) {
      clipboard.writeText(text);
      const pasteScript = 'tell application "System Events" to keystroke "v" using {command down}';
      try {
        await runOsaScript(pasteScript);
        return { success: true, method: 'accessibility' };
      } catch {
        try {
          await pause(70);
          await runOsaScript(pasteScript);
          return { success: true, method: 'accessibility' };
        } catch {
          return { success: false, method: 'clipboard' };
        }
      }
    },
  },
  clipboard: {
    async set(text: string) {
      clipboard.writeText(text);
    },
    async get() {
      return clipboard.readText();
    },
  },
  app: {
    async activeName() {
      try {
        return await new Promise<string | null>((resolve) => {
          execFile(
            '/usr/bin/osascript',
            [
              '-e',
              'tell application "System Events" to get name of first application process whose frontmost is true',
            ],
            (error, stdout) => {
              if (error) {
                resolve(null);
                return;
              }
              const name = stdout.trim();
              resolve(name.length ? name : null);
            }
          );
        });
      } catch {
        return null;
      }
    },
  },
  overlay: {
    async show(state) {
      ensureOverlayWindow();
      if (!overlayWindow) return;
      if (state === 'idle') {
        overlayText = '';
        pendingOverlayLevels = null;
        await waitForOverlayReady();
        overlayWindow.setOpacity(0);
        overlayWindow.hide();
        return;
      }
      if (!overlayReady) {
        await waitForOverlayReady();
        if (!overlayWindow || overlayWindow.isDestroyed()) return;
      }
      if (state === 'recording') {
        positionOverlayWindowAtDefault();
      }
      await updateOverlayState(state);
      if (overlayMode) {
        await updateOverlayMode(overlayMode);
      }
      overlayWindow.setOpacity(1);
      if (!overlayWindow.isVisible()) {
        overlayWindow.showInactive();
      }
    },
    async hide() {
      if (!overlayWindow) return;
      if (!overlayWindow.isDestroyed()) {
        overlayWindow.setOpacity(0);
        overlayWindow.hide();
      }
      overlayText = '';
      pendingOverlayLevels = null;
      overlayLevelsFlushScheduled = false;
      overlayLevelsFlushInFlight = false;
    },
    async setText(text) {
      const value = text ?? '';
      await updateOverlayText(value);
    },
    async setMode(text) {
      const value = text ?? '';
      await updateOverlayMode(value);
    },
  },
  permissions: {
    async check() {
      return {
        microphone: mapMicrophoneAccess(),
        accessibility: hasAccessibilityAccess() ? 'granted' : 'prompt',
      };
    },
    async requestGuidance() {
      return 'Open System Settings > Privacy & Security to grant microphone and accessibility access. For development builds, grant access to Electron. If text is copied but not pasted, also allow Electron to control System Events under Automation. Microphone permission is requested when you start recording.';
    },
  },
};
