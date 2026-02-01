susurrare

## Dev
- Install: `pnpm install`
- Run app: `pnpm dev`
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Format: `pnpm format`

## Tests
- Run all (lint + typecheck + tests): `pnpm test`
- Watch unit tests only: `pnpm -C packages/test-harness dev`

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
