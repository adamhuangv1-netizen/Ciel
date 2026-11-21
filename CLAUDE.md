# Ciel

A Windows desktop AI assistant: wake word "Hey Ciel", an ElevenLabs voice, a glowing emblem with notice cards, and a Claude Agent SDK brain. It's a personal build for now. A public release would need an original persona and API-key auth.

## Rules

- Original work only: no copied art, UI, text or cloned voices from the anime.
- The private persona pack (personas/ciel/) is gitignored and never committed: the GitHub repo is public.
- Every risky action goes through the autonomy gate. The brain never inherits the owner's Claude Code settings, plugins or CLAUDE.md.

## Run

- From [app/](app/): `npm run dev` (app) and `npx vitest run` (tests). Inside VS Code's Claude session, `ELECTRON_RUN_AS_NODE=1` is inherited and breaks Electron, so unset it first (`env -u ELECTRON_RUN_AS_NODE npm run dev`).

## Where things live

- [app/](app/): Electron + TypeScript desktop app (main, preload, renderer)

- [Design](docs/specs/2026-11-21-ciel-design.md): what Ciel is, the decisions, architecture, roadmap (M1–M5)
- [M1a plan](docs/plans/2026-11-21-m1a-foundation.md): spikes, scaffold, persona, overlay, voice. M1b (ears + brain) and M1c (gate UI, watchers, panel) are written after the spikes
