import type { PlatformAdapter } from '@susurrare/platform';

export const windowsAdapter: PlatformAdapter = {
  hotkey: {
    async registerHotkey() {
      throw new Error('Not Implemented');
    },
  },
  audioCapture: {
    async start() {
      throw new Error('Not Implemented');
    },
    async stop() {
      throw new Error('Not Implemented');
    },
    async cancel() {
      throw new Error('Not Implemented');
    },
  },
  insertText: {
    async atCursor() {
      throw new Error('Not Implemented');
    },
  },
  clipboard: {
    async set() {
      throw new Error('Not Implemented');
    },
    async get() {
      throw new Error('Not Implemented');
    },
  },
  overlay: {
    async show() {
      throw new Error('Not Implemented');
    },
    async hide() {
      throw new Error('Not Implemented');
    },
  },
  permissions: {
    async check() {
      throw new Error('Not Implemented');
    },
    async requestGuidance() {
      throw new Error('Not Implemented');
    },
  },
};
