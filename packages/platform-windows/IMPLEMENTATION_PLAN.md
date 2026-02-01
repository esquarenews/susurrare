# Windows Adapter Implementation Plan

This document outlines the concrete implementation work needed to bring the Windows adapter to parity with macOS.
The goal is to keep Core unchanged: only this adapter and its native dependencies should be implemented.

## Required Implementations

### 1) Global Hotkey
- Capture system-wide hotkeys for **hold** and **toggle** actions.
- Suggested approach:
  - Use a native Node-API module to register global hotkeys.
  - Support key chords and modifiers.
- Acceptance:
  - Fires callbacks on key down/up for hold-to-talk.
  - Toggle mode fires on key down.

### 2) Audio Capture (WASAPI)
- Low-latency microphone capture pipeline.
- Suggested approach:
  - WASAPI (loopback not required) for mic input.
  - Stream PCM chunks into `AsyncIterable`.
- Acceptance:
  - `start()` returns an async iterator of `AudioChunk`.
  - `stop()` returns a contiguous `AudioBlob` and duration.
  - `cancel()` discards buffer.

### 3) Insert/Paste (UI Automation / SendInput)
- Insert text into the currently focused control.
- Suggested approach:
  - UI Automation for direct insertion if available.
  - Fallback to SendInput (Ctrl+V) with clipboard.
- Acceptance:
  - `insertText.atCursor()` reports success/fallback.

### 4) Clipboard Integration
- Set/get clipboard text.
- Suggested approach: use Electron clipboard API for the Windows adapter.

### 5) Overlay Window
- Non-focus stealing status HUD.
- Suggested approach:
  - Create a transparent always-on-top window.
  - Update state via IPC from main process.

### 6) Permissions / Guidance
- Windows does not gate mic/automation the same way, but:
  - Provide `check()` with best-effort status.
  - Provide `requestGuidance()` with a link to Windows Privacy settings.

## Native Module Surface
- Keep the native module surface minimal:
  - hotkey register/unregister
  - audio capture start/stop/cancel
  - optional UIA helpers

## Parity Tests (expecting Not Implemented today)
- platform tests in `packages/test-harness/src/platform.spec.ts` should keep failing with "Not Implemented" until implemented.

