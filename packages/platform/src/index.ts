export type HotkeyAction = 'hold' | 'toggle';

export interface HotkeyConfig {
  key: string;
  action: HotkeyAction;
}

export interface HotkeyHandle {
  unregister(): Promise<void>;
}

export type HotkeyListener = (active: boolean) => void;

export interface AudioChunk {
  data: Uint8Array;
  timestamp: number;
}

export interface AudioBlob {
  data: Uint8Array;
  durationMs: number;
}

export interface HotkeyAdapter {
  registerHotkey(config: HotkeyConfig, listener: HotkeyListener): Promise<HotkeyHandle>;
}

export interface AudioCaptureAdapter {
  start(): Promise<AsyncIterable<AudioChunk>>;
  stop(): Promise<AudioBlob>;
  cancel(): Promise<void>;
}

export interface InsertResult {
  success: boolean;
  method: 'accessibility' | 'clipboard';
}

export interface InsertTextAdapter {
  atCursor(text: string): Promise<InsertResult>;
}

export interface ClipboardAdapter {
  set(text: string): Promise<void>;
  get(): Promise<string>;
}

export type OverlayState = 'recording' | 'processing' | 'idle';

export interface OverlayAdapter {
  show(state: OverlayState): Promise<void>;
  hide(): Promise<void>;
}

export interface PermissionStatus {
  microphone: 'granted' | 'denied' | 'prompt';
  accessibility: 'granted' | 'denied' | 'prompt';
}

export interface PermissionsAdapter {
  check(): Promise<PermissionStatus>;
  requestGuidance(): Promise<string>;
}

export interface PlatformAdapter {
  hotkey: HotkeyAdapter;
  audioCapture: AudioCaptureAdapter;
  insertText: InsertTextAdapter;
  clipboard: ClipboardAdapter;
  overlay: OverlayAdapter;
  permissions: PermissionsAdapter;
}
