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
  durationMs?: number;
}

export interface AudioBlob {
  data: Uint8Array;
  durationMs: number;
}

export interface HotkeyAdapter {
  registerHotkey(config: HotkeyConfig, listener: HotkeyListener): Promise<HotkeyHandle>;
}

export interface AudioCaptureAdapter {
  start(options?: { autoGain?: boolean; sampleRate?: number }): Promise<AsyncIterable<AudioChunk>>;
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

export interface AppAdapter {
  activeName(): Promise<string | null>;
}

export type OverlayState = 'recording' | 'processing' | 'done' | 'idle';

export interface OverlayAdapter {
  show(state: OverlayState): Promise<void>;
  hide(): Promise<void>;
  setText(text: string | null): Promise<void>;
  setMode?(text: string | null): Promise<void>;
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
  app: AppAdapter;
  overlay: OverlayAdapter;
  permissions: PermissionsAdapter;
}
