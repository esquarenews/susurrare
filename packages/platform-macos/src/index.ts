import { createRequire } from 'module';
import { execFile } from 'child_process';
import { BrowserWindow, clipboard, screen } from 'electron';
import type { PlatformAdapter } from '@susurrare/platform';

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
  loadUiohook().uIOhook.start();
  hookStarted = true;
};

const stopHook = () => {
  if (!hookStarted) return;
  loadUiohook().uIOhook.stop();
  hookStarted = false;
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
        // Always forward hold activation on keydown. This keeps hold-to-talk
        // recoverable if a keyup event is ever missed by the native hook.
        registration.active = true;
        registration.listener(true);
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
const STREAM_FRAME_MS = 20;
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
let lastWaveSentAt = 0;

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
        gap: 6px;
        align-items: center;
        justify-items: center;
        background: rgba(10, 14, 18, 0.7);
        border: 1px solid rgba(124, 255, 176, 0.28);
        border-radius: 24px;
        backdrop-filter: blur(12px);
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
        transition: border-color 0.35s ease, box-shadow 0.35s ease;
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
        width: 260px;
        height: 32px;
        border-radius: 16px;
        overflow: hidden;
      }
      canvas {
        display: block;
        width: 260px;
        height: 32px;
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
      }
      .timer {
        font-size: 11px;
        letter-spacing: 0.14em;
        font-variant-numeric: tabular-nums;
        opacity: 0.85;
      }
      .timer[data-visible='false'] {
        visibility: hidden;
      }
      .partial {
        font-size: 12.5px;
        line-height: 1.35;
        letter-spacing: 0.01em;
        opacity: 0.7;
        width: 100%;
        justify-self: stretch;
        max-width: 360px;
        height: calc(1.35em * 3);
        white-space: normal;
        overflow-y: auto;
        text-overflow: unset;
        text-align: center;
        scrollbar-width: none;
        transition: opacity 0.35s ease;
      }
      .partial::-webkit-scrollbar {
        width: 0;
        height: 0;
      }
      .partial[data-empty='true'] {
        opacity: 0;
      }
      body[data-state='recording'] .wrap {
        border-color: rgba(124, 255, 176, 0.35);
        box-shadow: 0 12px 30px rgba(10, 40, 20, 0.45);
      }
      body[data-state='processing'] .wrap {
        border-color: rgba(106, 167, 255, 0.35);
        box-shadow: 0 12px 30px rgba(22, 40, 78, 0.45);
      }
      body[data-state='done'] .wrap {
        border-color: rgba(165, 123, 255, 0.4);
        box-shadow: 0 12px 30px rgba(54, 24, 96, 0.45);
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
        <canvas id="wave" width="260" height="32"></canvas>
      </div>
      <div class="partial" id="partial" data-empty="true"></div>
      <div class="meta">
        <div class="timer" id="timer" data-visible="false">00:00</div>
        <div class="status" id="status">recording</div>
      </div>
    </div>
    <script>
      const canvas = document.getElementById('wave');
      const ctx = canvas.getContext('2d');
      const statusEl = document.getElementById('status');
      const timerEl = document.getElementById('timer');
      const partialEl = document.getElementById('partial');
      const modeEl = document.getElementById('mode');
      let phase = 0;
      let state = 'idle';
      let wave = Array(32).fill(0);
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
        statusEl.textContent = next;
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

      const setWave = (next) => {
        if (!Array.isArray(next) || next.length === 0) return;
        wave = next.map((value) => {
          if (typeof value !== 'number' || Number.isNaN(value)) return 0;
          return Math.max(-1, Math.min(1, value));
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

      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 3.2;
        if (state === 'processing') ctx.strokeStyle = 'rgba(106, 167, 255, 0.95)';
        else if (state === 'done') ctx.strokeStyle = 'rgba(165, 123, 255, 0.95)';
        else ctx.strokeStyle = 'rgba(124, 255, 176, 1)';
        if (state === 'recording') {
          ctx.shadowBlur = 12;
          ctx.shadowColor = 'rgba(124, 255, 176, 0.65)';
        } else if (state === 'processing') {
          ctx.shadowBlur = 10;
          ctx.shadowColor = 'rgba(106, 167, 255, 0.6)';
        } else if (state === 'done') {
          ctx.shadowBlur = 10;
          ctx.shadowColor = 'rgba(165, 123, 255, 0.6)';
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, canvas.width, canvas.height);
        ctx.clip();
        ctx.beginPath();
        const mid = canvas.height / 2;
        const maxAbs = wave.reduce((acc, value) => Math.max(acc, Math.abs(value)), 0);
        const maxAmp = Math.max(0, canvas.height / 2 - 3);
        const amp =
          state === 'recording' ? Math.min(maxAmp, 12 + maxAbs * 42) : 0;
        for (let x = 0; x <= canvas.width; x += 3) {
          const t = (x / canvas.width) * (wave.length - 1);
          const idx = Math.floor(t);
          const frac = t - idx;
          const next = wave[Math.min(idx + 1, wave.length - 1)] ?? 0;
          const value = (wave[idx] ?? 0) * (1 - frac) + next * frac;
          const y = mid + value * amp + Math.sin((x / 22) + phase) * (amp * 0.32);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
        phase += 0.18;
        requestAnimationFrame(draw);
      };

      window.__setOverlayState = setState;
      window.__setOverlayWave = setWave;
      window.__setOverlayText = setText;
      window.__setOverlayMode = setMode;
      syncTimer();
      draw();
    </script>
  </body>
</html>
`;

const ensureOverlayWindow = () => {
  if (overlayWindow) return;
  const width = 420;
  const height = 150;
  overlayWindow = new BrowserWindow({
    width,
    height,
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
  overlayWindow.setIgnoreMouseEvents(true);
  overlayWindow.setOpacity(0);
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const x = Math.round((screenWidth - width) / 2);
  const y = 24;
  overlayWindow.setPosition(x, y);
  overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayHtml())}`);
  overlayWindow.on('closed', () => {
    overlayWindow = null;
    overlayReady = false;
  });
  overlayWindow.webContents.on('did-finish-load', () => {
    overlayReady = true;
    if (overlayWindow) {
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
  if (!overlayWindow) return;
  if (!overlayReady) return;
  await overlayWindow.webContents.executeJavaScript(
    `window.__setOverlayState(${JSON.stringify(state)})`
  );
  if (state !== 'recording') {
    await overlayWindow.webContents.executeJavaScript(`window.__setOverlayText('')`);
  }
};

const updateOverlayWave = async (wave: number[]) => {
  if (!overlayWindow || !overlayReady) return;
  if (overlayState !== 'recording') return;
  if (!overlayWindow.isVisible()) return;
  const now = Date.now();
  if (now - lastWaveSentAt < 20) return;
  lastWaveSentAt = now;
  const script = `window.__setOverlayWave(${JSON.stringify(wave)})`;
  await overlayWindow.webContents.executeJavaScript(script);
};

const updateOverlayText = async (text: string) => {
  overlayText = text;
  if (!overlayWindow || !overlayReady) return;
  if (!overlayWindow.isVisible()) return;
  const script = `window.__setOverlayText(${JSON.stringify(text)})`;
  await overlayWindow.webContents.executeJavaScript(script);
};

const updateOverlayMode = async (text: string) => {
  overlayMode = text;
  if (!overlayWindow || !overlayReady) return;
  if (!overlayWindow.isVisible()) return;
  const script = `window.__setOverlayMode(${JSON.stringify(text)})`;
  await overlayWindow.webContents.executeJavaScript(script);
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
              if (currentRecording?.autoGainEnabled) {
                const rms = computeRms(data);
                const targetRms = 0.12;
                const desiredGain = rms > 0 ? targetRms / rms : 1;
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
              void updateOverlayWave(wave);
              return { data, timestamp: Date.now(), durationMs };
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
      try {
        await new Promise<void>((resolve, reject) => {
          execFile(
            '/usr/bin/osascript',
            ['-e', 'tell application "System Events" to keystroke "v" using {command down}'],
            (error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            }
          );
        });
        return { success: true, method: 'accessibility' };
      } catch {
        return { success: false, method: 'clipboard' };
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
        overlayWindow.hide();
        return;
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
        overlayWindow.destroy();
      }
      overlayWindow = null;
      overlayReady = false;
      overlayText = '';
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
      return { microphone: 'prompt', accessibility: 'prompt' };
    },
    async requestGuidance() {
      return 'Open System Settings > Privacy & Security to grant microphone and accessibility access.';
    },
  },
};
