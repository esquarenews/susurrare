# Susurrare

Cross-platform push-to-talk dictation (Electron + shared core). Built for macOS today with Windows-ready adapters.

## Quick start
- Install deps: `pnpm install`
- Install SoX (mic capture dependency): `brew install sox`
- Run app: `pnpm dev`

## Configuration
- Set your OpenAI key in **Configuration → OpenAI API key**, or via `OPENAI_API_KEY`.
- Optional base URL for mock servers: `OPENAI_BASE_URL`.
- Help button opens this README in your browser (or `SUSURRARE_HELP_URL` if set).

## Default hotkeys (remappable in Configuration)
- Push-to-talk (hold): `F15`
- Toggle recording (press once): `F14`
- Cancel recording: `Escape`
- Change mode: `Shift+Cmd+K`

## Models
- Fast: `gpt-4o-mini-transcribe`
- Accurate: `gpt-4o-transcribe`
- Meetings (diarize): `gpt-4o-transcribe-diarize`
- Pinned: custom model id

## Scripts
- Dev: `pnpm dev`
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Format: `pnpm format`

## Tests
- All (lint + typecheck + unit + e2e): `pnpm test`
- Unit tests only: `pnpm -C packages/test-harness test`
- E2E only: `pnpm test:e2e`

Tip: disable global hotkeys in CI/tests with `SUSURRARE_DISABLE_HOTKEYS=1`.

## Native dependencies (macOS)
- SoX is required for microphone capture: `brew install sox`
- Global hotkeys use `uiohook-napi` and must be rebuilt for Electron:
  - `pnpm dlx electron-rebuild -f -w uiohook-napi -v 31.7.7 -p apps/desktop`
  - If `node-gyp` fails, install Python 3.11 (distutils) and Xcode CLI tools.

## Packaging (macOS)
- Build app: `pnpm -C apps/desktop dist`
- Requirements:
  - Xcode Command Line Tools: `xcode-select --install`
  - Apple signing + notarization env vars:
    - `APPLE_ID`
    - `APPLE_ID_PASSWORD` (app-specific password)
    - `APPLE_TEAM_ID`
  - Optional update feed:
    - `SUSURRARE_UPDATE_URL` (generic provider URL)
  - Optional: `CSC_IDENTITY_AUTO_DISCOVERY=false` to skip signing locally

## Updates
- Manual update check uses `SUSURRARE_UPDATE_URL` when present.
- Automatic update checks run every 4 hours when "Automatically check for updates" is enabled.
