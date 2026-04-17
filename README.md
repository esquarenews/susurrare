# Susurrare

Cross-platform push-to-talk dictation (Electron + shared core). Built for macOS today with Windows-ready adapters.

## Quick start
- Install deps: `pnpm install`
- Install SoX (mic capture dependency): `brew install sox`
- Run app: `pnpm dev`

## Configuration
- Set your OpenAI key in **Configuration → OpenAI API key**, or via `OPENAI_API_KEY`.
- Optional base URL for mock servers: `OPENAI_BASE_URL`.
- Help button opens the help wiki (or `SUSURRARE_HELP_URL` if set).

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
- The global hold-to-talk helper is compiled automatically during `pnpm dev` and `pnpm -C apps/desktop build`.
- If the helper fails to register on macOS in development, Vocsen exits immediately so you do not continue with a broken F15 path.

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
