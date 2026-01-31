import type { PlatformAdapter } from '@susurrare/platform';

export const windowsAdapter: PlatformAdapter = {
  hotkey: {
    async registerPushToTalk() {
      // TODO: implement Windows hotkey binding
    },
    async unregisterPushToTalk() {
      // TODO: implement Windows hotkey binding
    },
  },
  audio: {
    async startCapture() {
      // TODO: implement audio capture
    },
    async stopCapture() {
      return new Uint8Array();
    },
    async cancelCapture() {
      // TODO: implement cancel
    },
  },
  clipboard: {
    async pasteText() {
      // TODO: implement paste into focused input
    },
    async writeText() {
      // TODO: implement clipboard write
    },
  },
  overlay: {
    async showRecording() {
      // TODO: implement overlay window
    },
    async showProcessing() {
      // TODO: implement overlay window
    },
    async hide() {
      // TODO: implement overlay window
    },
  },
};
