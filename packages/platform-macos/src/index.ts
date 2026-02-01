import { createRequire } from 'module';
import { execFile } from 'child_process';
import { clipboard } from 'electron';
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

const SAMPLE_RATE = 16000;
let currentRecording:
  | {
      recorder: { stop: () => void };
      stream: NodeJS.ReadableStream;
      iterable: AsyncIterable<{ data: Uint8Array; timestamp: number }>;
      chunks: Uint8Array[];
      totalBytes: number;
      stopped: Promise<void>;
      resolveStopped: () => void;
    }
  | null = null;

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
    async start() {
      if (currentRecording) {
        return currentRecording.iterable;
      }
      const recorder = record.record({
        sampleRate: SAMPLE_RATE,
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
      currentRecording = {
        recorder,
        stream,
        iterable: {
          async *[Symbol.asyncIterator]() {
            for await (const chunk of stream as AsyncIterable<Buffer>) {
              const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
              const data = new Uint8Array(buffer);
              if (currentRecording) {
                currentRecording.chunks.push(data);
                currentRecording.totalBytes += data.length;
              }
              yield { data, timestamp: Date.now() };
            }
          },
        },
        chunks: [],
        totalBytes: 0,
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
      const durationMs = Math.round((data.length / 2 / SAMPLE_RATE) * 1000);
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
  overlay: {
    async show() {
      // TODO: implement overlay window
    },
    async hide() {
      // TODO: implement overlay window
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
