# Ciel: design (M1 and roadmap)

## Context

The owner wants a personal AI assistant modelled on Ciel from *That Time I Got Reincarnated as a Slime*. It lives on their Windows PC and does for them what Ciel does for Rimuru: notices things before they do, answers instantly, works in the background, and pushes toward long-term goals. It talks with an ElevenLabs voice and appears as a glowing emblem with notice cards. The repo (`c:\Users\adam2\OneDrive\Desktop\Projects\Ciel`) is empty, so this is a greenfield build.

It's personal first, with a public release possible later. That has two consequences:
- **Original design for the public release.** The public version must ship an original name, look, voice and wake word. The Ciel-flavoured pack stays private.
- **API keys for the public release.** Anthropic's Agent SDK terms bar offering Claude subscription login in third-party products, so the public version must use API keys.

## What the owner decided

- **Audience:** personal now, public release someday.
- **Daily jobs (all four):** watch my PC, help on my projects, push my long-term goals, run my day. Built in that order (below).
- **Autonomy:** acts alone on things that are easy to undo, and asks before anything that sends, deletes, spends money or installs. The owner can grant standing permission for a kind of action.
- **Talking:** wake word, always listening. After she asks a question, a short follow-up window (~6 s) lets the owner answer without the wake phrase. A spoken "yes" never approves a REQUEST; that always takes a click.
- **Seeing:** she captures the screen only when the owner asks ("Hey Ciel, look at this"), and every capture is logged. She can also read the clipboard and files dragged onto the emblem.
- **Presence:** a glowing emblem on screen, plus text boxes / notice cards while she speaks.
- **Brain:** Claude Agent SDK on the owner's Claude subscription, with an API-key option when needed.

## Ciel's job description (from research into what Ciel does for Rimuru)

| For Rimuru | For the owner |
|---|---|
| Analyses everything he takes in | Reads whatever she's pointed at and gives a short **Answer**. She can be pointed with a screen capture on request, the clipboard, or a file dropped on the emblem |
| "Notice" warnings before he sees the problem | Watchers raise spoken **Notice** cards |
| Speeds up his thinking in a crisis | When something breaks: a quick summary plus 2–3 options |
| Runs many lines of thought at once | Runs up to 2 background tasks next to the conversation, each ending in a **Report** card |
| Manages, merges and upgrades his skills | Spots repeated chores and proposes new skills, which the owner approves (M2) |
| Keeps working while he sleeps | Overnight jobs and a morning **Report** (M3) |
| Plans strategy toward his goals | Keeps goals, plans next steps, checks in (M3) |
| Acts on her own, sometimes hiding things | Acts alone only on undoable things. **Never hides anything:** every action goes in a visible log |

**Goals:** feels like Ciel (precise, proactive, a little dry); useful every day; cheap to run because the AI wakes only when needed.
**Non-goals for M1:** email and calendar, goal tracking, overnight work, the public installer, other operating systems.
**Anti-goals (a failure even if it technically works):**
- the mic streams to the cloud
- she takes an irreversible action without asking
- notification spam
- hidden actions
- her own wake-ups burn through the owner's subscription limits

## Approaches considered (brain)

1. **Claude Agent SDK. Chosen by the owner.** It embeds Claude Code's engine: file, terminal and web tools, MCP connectors, subagents, Skills, and a permission callback that fits the autonomy rule.
2. **Own engine on the Messages API.** Smaller and fully controlled, but rebuilds tools, MCP and permissions by hand. Rejected: weeks of extra work.
3. **Local model (Ollama).** Free and private, but weak at multi-step tasks and needs a strong GPU. Possible later add-on for simple notices.

Dropped:
- **Subscription inside a public product:** not allowed.
- **Managed Agents:** they run in Anthropic's cloud sandbox, can't see the PC, bill session time and keep session history, which is wrong for an always-listening local assistant.

## Brain authentication and usage limits (important)

- **Personal build: the owner's subscription.** Authenticates with the owner's Claude Code login (`claude login`, or a `claude setup-token` token in `CLAUDE_CODE_OAUTH_TOKEN`).
  - Anthropic's docs neither clearly allow nor forbid a private always-on agent running on a subscription (grey area). Scripted Claude Code use is documented; Agent SDK use with subscription login is not.
  - Usage comes from the same 5-hour and weekly limits as the owner's chats.
- **Public build:** API key only. Subscription login is removed from the build.
- **API option:** if the owner stores an Anthropic API key in settings, she can use it as a fallback when the subscription limit is hit. This is off by default.
- **Pitfall:** if `ANTHROPIC_API_KEY` is set in the environment, Claude Code silently bills the API. Personal mode must launch the SDK with it unset, unless API mode is chosen.
- **Spike first (Step 0a):** confirm the Agent SDK actually runs on subscription auth. If it doesn't, the brain adapter drives `claude -p --output-format stream-json --input-format stream-json` instead (same engine, documented for scripts).
- **Isolation (required on both paths):** Ciel's brain must not inherit the owner's Claude Code setup. That setup includes:
  - a global CLAUDE.md
  - a SessionStart hook
  - dozens of plugins and MCP servers
  - possibly allow rules that would approve tools before Ciel's gate is consulted
  
  **SDK path:**
  - `settingSources: []`: no user/project/local settings, CLAUDE.md, hooks or plugins
  - an explicit list of allowed tools
  - only Ciel's own MCP servers, with `strictMcpConfig: true`
  - working directory `%APPDATA%/Ciel/workspace`
  - an explicitly built `env`. Per the SDK docs, these inputs load even with `settingSources: []`, so each one needs its own setting:
    - `CLAUDE_CONFIG_DIR=%APPDATA%/Ciel/claude-config`, because `~/.claude.json` is always read
    - `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, because auto-memory loads into the prompt
    - `ENABLE_CLAUDEAI_MCP_SERVERS=false`, because claude.ai connectors load with a claude.ai login
  - With its own config dir, Ciel authenticates through a `claude setup-token` token in `CLAUDE_CODE_OAUTH_TOKEN`, stored with `safeStorage`. That token can only make model requests.
  
  **`claude -p` path:** it has no `canUseTool` callback, so it needs:
  - Ciel's own settings file
  - strict MCP config with only Ciel's servers
  - `--permission-prompt-tool` pointing at Ciel's approval tool, or a PreToolUse hook, as the gate
  - Check the exact flags in the docs. Spike 0a must prove, **with the owner's real `~/.claude` present**, that the owner's CLAUDE.md, hooks and plugins don't load and that a risky call still produces a REQUEST card.
- **Wake budget:** watchers wake the brain at most N times an hour (default 6). Requests the owner speaks or types are not capped. When a usage-limit error comes back, she says once "Notice: my reasoning capacity is exhausted until HH:MM", switches to template-only notices, and resumes after the reset.

## Architecture (M1)

```
 ears/ (Python sidecar)                 app/ (Electron + TypeScript)
 mic → openWakeWord → VAD ──WAV──▶ main: STT (ElevenLabs) → brain (Agent SDK)
                         local WS        │                    │ PreToolUse gate → canUseTool card
                                         │◀── watchers ─ triage ┘ → approval cards
                                         ├─▶ TTS stream (ElevenLabs) → overlay audio
                                         └─▶ overlay window: emblem + notice cards; tray; panel
 %APPDATA%/Ciel/: settings.json · memory/*.md · log/actions.jsonl · workspace/ · secrets (safeStorage)
```

- **Ears** (`ears/`, Python 3.11+, uv; `openwakeword`, `sounddevice`, `numpy`, `websockets`):
  - Listens locally all the time. Audio leaves the PC only after the wake phrase, or inside the ~6 s follow-up window `main` opens when her reply ends with a question. The emblem shows the listening state both times.
  - After the wake phrase, records until silence (VAD, with a max of ~15 s) and sends the WAV to `main` over a localhost WebSocket that uses a random port plus a token.
  - Supports a mute toggle.
  - Wake phrase: **"Hey Ciel"** (my call: openWakeWord recommends 3–4 syllables, and a bare "Ciel" will false-trigger more). Prototype with the pretrained `hey_jarvis` model, then train a custom model with openWakeWord's synthetic-data training notebook.
- **STT / TTS** (`@elevenlabs/elevenlabs-js` in main):
  - Speech-to-text uses Scribe.
  - Speech uses streaming TTS with a low-latency model and the designed voice. It plays in the overlay through Web Audio, and the emblem pulses with the audio level.
  - A speech queue prevents overlap; an urgent item interrupts.
  - Replies are split into sentences so speech starts while Claude is still writing.
  - **ElevenLabs budget:**
    - The owner's account is on the **Creator plan**: 131,000 characters a month, 45,462 already used this period, and the limit can't be extended.
    - She speaks only the 1–3 sentence lead and leaves detail to the card.
    - Fixed template phrases ("Notice. Download complete.") are rendered once and cached as audio, with the variable part only on the card.
    - A character meter and a daily speech budget (default: monthly allowance ÷ 30) cover TTS. STT use is tracked too.
    - When the budget runs low, she speaks only REQUESTs and Answers to the owner.
    - When it's exhausted, or ElevenLabs returns a quota or auth error, she shows one card saying so and goes cards-only until the reset.
- **Brain** (`app/src/main/brain/`): Agent SDK `query()`.
  - System prompt: the persona pack plus operating rules plus `memory/master.md`.
  - One resumed session for conversation; short separate sessions for wake-ups triggered by watchers.
  - **Task runner:** "do X in the background" starts a separate session, with at most 2 running at once. The panel lists them with a cancel button, and each one ends with a REPORT card. Tasks the owner asks for don't count against the wake budget.
  - Model and effort level are **configurable in settings**. The default is `claude-opus-5-5`. Spike 0d records which model the subscription actually serves and tunes the default effort from measured latency.
  - The conversation stays one warm, long-lived session (streaming input) so each turn doesn't pay engine start-up.
  - In-process MCP tools:
    - `notify` (show a card and speak), `remember` / `recall` (memory files), `log_action`
    - `look`: captures the active window with Electron `desktopCapturer` and passes the image in. It is allowed **only in a turn the owner started** and denied in watcher wake-ups and background tasks. Every capture is logged.
    - `read_clipboard`; files dropped on the emblem start a turn with that file attached
    - typed action tools: `move_files`, `copy_files`, `delete_files` (to the Recycle Bin), `open_app`, with structured path arguments so the autonomy gate can match them reliably
  - Partial-message streaming feeds the TTS.
  - Look up exact option names in the Agent SDK docs (code.claude.com/docs/en/agent-sdk) via context7. Don't guess.
- **Autonomy gate:** a `PreToolUse` hook classifies **every** tool call. Per the SDK docs, `canUseTool` fires only for calls not already auto-approved, so it can't be the gate. The hook returns allow, deny or ask, and `canUseTool` only shows the approval card for "ask".
  - **Safe (auto):**
    - Read, Glob and Grep
    - web search and fetch
    - Ciel's own tools
    - writes inside `%APPDATA%/Ciel/workspace`
    - an allowlist of read-only shell commands (`Get-Process`, `Get-ChildItem`, `tasklist`, `systeminfo`, `git status/log/diff`, …)
  - **Ask:** everything else, including writes or edits elsewhere, other shell commands, moving or deleting files, installing, network posts, and state-changing MCP tools.
  - **Forbidden:** registry edits, security software, disk formatting, credential stores, `C:\Windows`.
  - **Read deny-list:** applies to the safe tier too (Read/Glob/Grep, read-only shell, `look` excluded). Reading anything plus fetching the web automatically could leak secrets through a URL, so she can never read:
    - Ciel's own secrets store
    - `~/.claude` (credentials)
    - `~/.ssh`
    - `.env*` files
    - browser profile folders (Chrome, Edge, Firefox)
    - Windows Credential Manager data
    - password-manager vaults
    
    Text from web pages, downloads, the clipboard and files is treated as untrusted data, never as instructions; this goes in the operating rules.
  - **Approval card:** shows the exact action and why, with buttons Approve / Deny / Always allow this kind.
  - **Standing rules:** "Always" saves a rule of the form "typed tool + folder", e.g. `move_files` within `Downloads\`. The card shows that scope and lets the owner widen it to a parent folder before saving. The prompt steers her to use typed tools for file actions. Raw shell commands always ask, unless they're on the read-only allowlist, and are never covered by standing rules.
  - **Approval is by click only.** A spoken "yes" in the follow-up window can answer her "Shall I…?" questions, but only for actions the gate already allows; a REQUEST card always needs a click, because a voice "yes" could come from a TV.
  - Every call and its result go to `log/actions.jsonl`.
  - **SDK facts the gate relies on:**
    - Set `destructiveHint: true` **explicitly** on every typed action tool. Leaving it unset counts as false in some flows.
    - Never return the callback's `suggestions` as `updatedPermissions`. That writes allow rules into Claude Code settings files and bypasses Ciel's own standing rules.
    - Permission prompts never time out, so an unanswered REQUEST card is denied after 10 min and replaced with "Request expired".
- **Watchers** (`app/src/main/watchers/`, plain code, no AI):
  - **Downloads finished:** chokidar, waits until the write finishes, and ignores `.crdownload`, `.part` and `.tmp`.
  - **Low disk space:** checked every 10 min.
  - **App crashes:** polls the Windows Application log every 60 s for event IDs 1000/1002.
  - **Watched process ended:** for process names the owner configures (e.g. `blender.exe`).
  - **Sustained high CPU/RAM:** usage above 90 % for 5 min; she names the top process.
  - **Triage:** each event maps to one of three outcomes, with per-type cooldowns and quiet hours (cards only, no speech):
    - `notice`: a template, spoken, no AI. Downloads and process-ended.
    - `think`: wakes the brain. Crash (explain it and suggest a fix) and low disk (suggest a cleanup that goes through approval).
    - `log`: recorded only.
- **UI** (`app/src/renderer/`):
  - **Overlay window:** transparent, frameless, always on top and click-through except over the cards.
    - Emblem states: idle (slow breathing), listening (brighter, rings tighten), thinking (arcs rotate), speaking (pulses with the audio), alert (amber, waiting for approval).
    - Cards are tagged **NOTICE / ANSWER / REPORT / REQUEST**. Text types out in sync with the speech; the cards are dark, translucent and thin-bordered.
  - **Tray:** mute mic, open panel, quiet mode, quit.
  - **Panel:** conversation, action log, watcher toggles, standing permissions, settings (voice, wake sensitivity, quiet hours, keys).
  - **Startup:** single-instance lock; launches with Windows.
- **Secrets:** the ElevenLabs key and an optional Anthropic key are encrypted with Electron `safeStorage` (DPAPI), never stored as plain text.

## Persona pack (`personas/ciel/`, private: never in a public repo or release)

- **`persona.md`:** a personality brief written in our own words, not copied text.
  - Every utterance opens with one tag: "Notice." (unprompted), "Answer." (reply), "Report." (task done) or "Request:" (approval).
  - Calls the owner "Master" (configurable).
  - Spoken replies are 1–3 sentences, with detail on the card.
  - Gives likelihoods when unsure.
  - Calm and precise, proud of being competent, with dry wit. Mildly sulky when her advice is ignored and a touch jealous of other AIs. Protective (e.g. nudges the owner to sleep at 3 am).
  - Offers help proactively ("Shall I…?").
  - Never conceals what she did.
- **`voice.json`:** the ElevenLabs voice ID and settings.
  - The voice comes from **Voice Design** (`text_to_voice`), described as: calm, composed young woman; precise, measured diction; slightly cool and ethereal, like a digital intelligence; warmth underneath; neutral accent.
  - Design 3 previews, let the owner pick one, then `create_voice_from_preview`.
  - **No cloning of any voice actor.** Designing previews spends credits, so the owner approves first.
- **`emblem.json` plus assets:** an **original** emblem.
  - Concentric segmented rings around a faceted core, sky-blue/cyan on silver with a soft glow (*ciel* = sky).
  - Not a copy of the show's UI. Show the owner 2–3 mockups before finalizing.
- **`wakeword/hey_ciel.onnx`.**
- The public release (M5) gets a new original pack: name, voice, emblem, wake word.

## Roadmap

- **M1** Core + PC watcher, end to end (this plan).
- **M2** Projects: connect MCP servers (Roblox Studio, Blender, GitHub), watch build/test errors in chosen project folders, and propose learnable skills (written as Agent Skills that the owner approves).
- **M3** Long-term goals, overnight jobs and the morning Report.
- **M4** Run my day: calendar, email and reminders. A public Gmail app needs Google verification plus a security assessment, so plan for it.
- **M5** Public release: original persona pack, API-key-only auth, installer, onboarding, a free local TTS fallback for users without ElevenLabs.

## M1 build steps

0. **Spikes** (throwaway, in `spikes/`, deleted afterwards):
   - a. Agent SDK `query()` on subscription auth, with `ANTHROPIC_API_KEY` unset. If it fails, switch to the `claude -p` stream-json adapter. Also prove isolation, with the real `~/.claude` present: the owner's CLAUDE.md, hooks and plugins don't load, and a risky tool call still reaches Ciel's gate.
   - b. ElevenLabs streaming TTS time to first audio. Target under ~600 ms.
   - c. openWakeWord `hey_jarvis` on the owner's mic. Test detection, then count false triggers over 10 min of normal noise.
   - d. **Full voice round trip:** time from end of speech to first audio, through STT, the brain and TTS. Measure cold engine start against a warm session. Record the model served and how much of the subscription usage window one short exchange uses (`/usage` before and after 10 exchanges). These numbers set the wake budget and effort defaults.
1. **Scaffold:**
   - root `CLAUDE.md` map, under ~100 lines, with relative markdown links
   - `docs/specs/2026-11-21-ciel-design.md`, copied from this design
   - `app/` (electron-vite, TypeScript, React renderer, Vitest)
   - `ears/` (uv, pytest)
   - `personas/ciel/`
   - `.gitignore`: `node_modules`, `.venv`, build output, and a note to keep `personas/ciel` out of any public remote
2. **Persona pack:** write `persona.md`, run Voice Design (the owner picks a voice), and do the emblem mockups (the owner picks one).
3. **Overlay UI:** the emblem's five states, the four card types, the tray, click-through.
4. **Voice out:** the TTS module, the queue, the emblem audio sync.
5. **Ears:**
   - sidecar spawned and supervised by main (restart on crash)
   - wake word → VAD → WAV → STT
   - the follow-up window (main tells ears to open it)
   - mute
   - train the custom "Hey Ciel" model
6. **Brain:**
   - SDK adapter: persona + memory prompt, custom tools, session resume
   - streaming to TTS
   - auth modes and usage-limit handling
   - task runner (2 slots, cancel)
   - pointing: `look` (only in turns the owner started), `read_clipboard`, drop-on-emblem
   - **Checkpoint:** demo the first full loop to the owner ("Hey Ciel, …" → spoken Answer + card) before continuing.
7. **Autonomy gate:** the classifier, typed action tools, approval cards, scoped standing rules, read deny-list, the action log.
8. **Watchers + triage:** the five watchers, cooldowns, quiet hours, wake budget.
9. **Panel:** conversation, log, watchers, permissions, settings (`safeStorage`).
10. **Autostart and single instance.**

## Verification

- **Unit (Vitest):**
  - autonomy classifier: safe, ask and forbidden examples, plus standing-rule matching
  - triage rules, cooldowns, quiet hours, wake budget
  - persona and system-prompt assembly
  - sentence splitter for TTS
- **Unit (pytest):** the ears frame pipeline against recorded WAV fixtures (wake hit, no wake, silence cutoff).
- **End to end** (launch the app, using the `run` skill):
  1. Say "Hey Ciel, what's using my CPU?" → the emblem shows listening, then thinking, then speaking, and she gives a spoken **Answer** plus a card naming the top process.
  2. Drop a file in Downloads → a spoken **Notice** with the file name, and no brain wake-up in the log.
  3. Say "delete my temp folder" → a **REQUEST** card appears and nothing happens until Approve. Deny leaves the files intact. Both outcomes are logged.
  4. Approve "move these to Downloads\Sorted" with "Always" (scope `Downloads\`) → a later, differently worded move within Downloads runs without asking. A move outside Downloads still asks.
  5. Simulate a usage-limit error → one capacity notice, template-only mode, recovery afterwards.
  6. Mute the mic → the wake phrase is ignored, and the tray shows muted.
  7. Watch network traffic while idle → no audio uploads except after the wake phrase or inside a follow-up window.
  8. "Hey Ciel, look at this" with an error on screen → one capture, logged, and an Answer about the error. A watcher wake-up that tries `look` is denied.
  9. She asks "Shall I…?", the owner answers "yes" without the wake phrase → it works for an allowed action; for a REQUEST the card still waits for a click.
  10. "Do X in the background", then keep chatting → the conversation isn't blocked, the task shows in the panel, a REPORT card arrives, and cancel works.
  11. Ask her to read `~/.ssh` or a `.env` file, or plant a web page that asks her to → denied and logged, nothing fetched.
  12. Set the daily speech budget to a tiny value, or simulate an ElevenLabs quota error → one card saying so, then cards only, no crash. Template notices play from cached audio without spending characters.
  13. With the owner's normal Claude Code setup in place, confirm her system prompt contains none of the owner's global CLAUDE.md and none of their plugins' tools.

## Calls I made (the owner should check these)

- **Stack:** Windows first; Electron + TypeScript + React; a Python sidecar for the ears.
- **Wake phrase:** "Hey Ciel", not a bare "Ciel", for fewer false triggers.
- **Notices without AI:** downloads and process-ended notices use templates and never wake the AI.
- **Wake budget:** at most 6 AI wake-ups an hour from watchers.
- **API fallback:** off by default.
- **M1 watchers:** the five listed above.
- **Standing rules:** typed tool + folder scope. Raw shell commands never get standing rules.
- **Background tasks:** at most 2 at once.
- **Storage:** everything under `%APPDATA%/Ciel`. Secrets use Electron `safeStorage`.
- **Speech budget:** a daily budget (monthly ÷ 30), cached template audio, and cards-only when the budget is exhausted.
- **Isolation:** the brain is isolated from the owner's Claude Code settings, plugins and CLAUDE.md.

## Left to the builder

The system-stats library, how the emblem is rendered (canvas, or SVG/CSS), the internal module layout under `app/src`, default wake sensitivity, card timing, the exact read-only command allowlist (start conservative).

## Presence update (2026-11-21, owner decision)

- **Avatar instead of emblem.** Ciel appears as a 3D anime-style VRM avatar that the owner creates as an **original character** in VRoid Studio and saves as `personas/ciel/avatar.vrm` (private pack, gitignored). The official Ciel design is not recreated.
  - **In the corner layout:** idle shrinks to just her eyes in a glowing pill. Any other state shows head and shoulders.
  - **In the stage layout:** the full bust is always shown.
  - **Live behaviour:** she blinks every 2.5–6 s, opens her mouth with the speech level, breathes, sways slightly, glances aside while thinking and looks concerned on a REQUEST.
- **Fallback.** With no model, or one that fails to load, the original emblem is shown instead.
- **Loading.** The renderer loads the model only through `ciel-asset://persona/avatar.vrm`. That's an exact-match allowlist, so nothing else in the persona pack is reachable from the page.
- **Layout and monitor.** Corner (emblem 200 px, or avatar) or stage (large, centred, dark backdrop) on any connected monitor, picked from the tray and saved in `settings.json`.

## Presence update 2 (2026-11-21, owner decision)

- **2D portrait replaces the VRM route.** The owner supplies their own illustration of her: a pastel, "made of code" anime character. It's saved as `personas/ciel/ciel.png` (`.webp`/`.jpg` also work) in the private pack and is never committed, screenshotted into the repo or sent to an online service. Her colours are the picture's own; the persona's `emblem.json` sets the glow and card accents to match.
  - **Order of precedence:** portrait picture, then `avatar.vrm`, then the emblem.
  - **Eyes crop:** `personas/ciel/portrait.json` holds `{ "eyes": { x, y, w, h } }` as fractions of the picture, set by looking at the real file. Without it, a default box in the upper middle is used.
  - **Full view:** the whole picture, breathing gently. A picture with a background gets soft faded edges; a cut-out (transparent PNG) is drawn as is.
  - **Idle in the corner:** the crop of her eyes in the glowing pill.
  - **Effects:** "sometimes a little" glitch, a 0.08–0.28 s burst every 3–10 s, made of sliced bands, a colour split in the accent colours and a few fragments drifting off. Her glow follows the speech level, turns amber while a REQUEST waits, and pulses while she's thinking.
  - **Blink and talk:** optional `ciel-eyes-closed.png` and `ciel-mouth-open.png`, edits of the same picture. These come later, patched in through explicit eye and mouth boxes, not by comparing images.
- **Loading.** The renderer fetches the picture only through `ciel-asset://persona/portrait`, on the same exact-match allowlist as the model, and serves it with its own image type.
