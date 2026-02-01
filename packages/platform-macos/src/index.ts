import { clipboard } from 'electron';
import type { PlatformAdapter } from '@susurrare/platform';

export const macosAdapter: PlatformAdapter = {
  hotkey: {
    async registerHotkey() {
      // TODO: implement with native hotkey binding
      return {
        async unregister() {
          // TODO: implement with native hotkey binding
        },
      };
    },
  },
  audioCapture: {
    async start() {
      // TODO: implement audio capture
      const iterable: AsyncIterable<{ data: Uint8Array; timestamp: number }> = {
        async *[Symbol.asyncIterator]() {
          // no chunks yet
        },
      };
      return iterable;
    },
    async stop() {
      return { data: new Uint8Array(), durationMs: 0 };
    },
    async cancel() {
      // TODO: implement cancel
    },
  },
  insertText: {
    async atCursor(text: string) {
      clipboard.writeText(text);
      // TODO: implement accessibility insertion to paste at cursor
      return { success: true, method: 'clipboard' };
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
