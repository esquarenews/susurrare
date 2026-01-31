export type HotkeyListener = (active: boolean) => void;

export interface HotkeyAdapter {
  registerPushToTalk(key: string, listener: HotkeyListener): Promise<void>;
  unregisterPushToTalk(): Promise<void>;
}

export interface AudioCaptureAdapter {
  startCapture(): Promise<void>;
  stopCapture(): Promise<Uint8Array>;
  cancelCapture(): Promise<void>;
}

export interface ClipboardAdapter {
  pasteText(text: string): Promise<void>;
  writeText(text: string): Promise<void>;
}

export interface OverlayAdapter {
  showRecording(): Promise<void>;
  showProcessing(): Promise<void>;
  hide(): Promise<void>;
}

export interface PlatformAdapter {
  hotkey: HotkeyAdapter;
  audio: AudioCaptureAdapter;
  clipboard: ClipboardAdapter;
  overlay: OverlayAdapter;
}
