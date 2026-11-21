# M1a Foundation Implementation Plan (spikes, scaffold, persona, overlay, voice)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** prove the risky unknowns with spikes, then ship a running Ciel shell. The shell is a click-through overlay with the original emblem and notice cards that speaks in the designed ElevenLabs voice within a daily speech budget.

**Architecture:**
- Four throwaway spikes settle brain auth and isolation, voice latency and wake-word quality, and are recorded in a results doc.
- An Electron + TypeScript app (electron-vite, React renderer):
  - main process: windows, tray, the TTS client, the speech queue and the budget
  - renderer: draws the emblem and cards, and plays streamed PCM through Web Audio
- A private persona pack in `personas/ciel/` supplies the personality brief, voice settings and emblem colours.

**Tech Stack:** Node 24, Electron + electron-vite, TypeScript (strict), React, Vitest + @testing-library/react, `@elevenlabs/elevenlabs-js`, zod. Spikes also use `@anthropic-ai/claude-agent-sdk`, Python 3.13 via uv, `openwakeword` and `sounddevice`.

**Spec:** [Ciel design](../specs/2026-11-21-ciel-design.md)

**Follow-on plans:** M1b (ears + brain, up to the voice-loop checkpoint) and M1c (autonomy-gate UI, watchers, panel, autostart). Both are written after Task 0's results are in.

## Global Constraints

- Windows 11 only. Paths come from `app.getPath('appData')` + `Ciel`, never hard-coded.
- TypeScript `strict: true`; no `any` in exported signatures.
- **Original work only:** no art, UI, text or audio copied from the anime, and no voice cloning of any actor.
- The persona pack `personas/ciel/` is private. `.gitignore` carries a comment saying it must never be pushed to a public remote.
- Secrets are never written to disk as plain text. In M1a the ElevenLabs key comes from the `ELEVENLABS_API_KEY` user environment variable, which the owner sets.
- ElevenLabs account: the limit, used count and reset time are read live from `client.user.subscription.get()`. Today that's the Creator plan with 131,000 a month, so the daily speech allowance is `floor(131000 / 30) = 4366` characters.
- Card tags are exactly `NOTICE`, `ANSWER`, `REPORT`, `REQUEST`. Emblem states are exactly `idle`, `listening`, `thinking`, `speaking`, `alert`.
- Default brain model id for later plans: `claude-opus-5-5`. Isolation: `settingSources: []`.
- **No commit without the owner's go-ahead.** Commit steps below assume the owner has approved committing for this plan.

## Review Focus

1. **Display layout:** a second monitor, the taskbar docked left or top, or 150 % scaling. The overlay must sit inside the primary display's work area, with cards fully visible. *Test: `overlayBounds` in Task 3.*
2. **Full-screen games and apps:** the overlay must never take focus or swallow clicks. It is click-through except while the pointer is over a card. *Test: window options and set-interactive IPC in Task 3.*
3. **Long answers:** a 2,000-character Answer must not be read out in full. Only the lead is spoken (≤ 3 sentences, ≤ 300 chars); the full text scrolls on the card. *Test: `speakableLead` in Task 4.*
4. **ElevenLabs down or out of quota:** cards still appear at once, nothing crashes, and exactly one "voice unavailable" notice is shown. *Test: SpeechQueue in Task 5.*
5. **Bursts:** 10 events in a second must not flood the screen or the speakers. Show at most 3 cards plus "+N more", and drop queued Notice speech older than 30 s. *Tests: CardStack in Task 3, SpeechQueue in Task 5.*

---

### Task 0: Spikes and spike results

Throwaway code in `spikes/`, which is gitignored and deleted at the end of the task. No TDD: each spike has a pass criterion and records numbers.

**Needs the owner:**
- `ELEVENLABS_API_KEY` set as a user environment variable
- a working microphone
- about 15 minutes of speaking and quiet
- possibly `claude setup-token`

**Files:**
- Create: `spikes/brain-auth/package.json`, `spikes/brain-auth/auth.mjs`
- Create: `spikes/tts-latency/package.json`, `spikes/tts-latency/tts.mjs`
- Create: `spikes/wakeword/pyproject.toml`, `spikes/wakeword/wake.py`
- Create: `spikes/roundtrip/roundtrip.mjs`, which reuses the other two packages' deps
- Create (kept): `docs/spikes/2026-11-21-spike-results.md`
- Modify: `CLAUDE.md`, adding a line linking the results doc

**Interfaces:**
- Produces: the results doc, with these values that M1b reads:
  - `brainAdapter`: `sdk` | `cli`
  - `authMode` that worked: `login` | `setup-token`
  - `ttsModelId`
  - TTS time to first byte, p50 / p95
  - `wakeThreshold`
  - false triggers per 10 min
  - round-trip ms per stage, cold vs warm
  - share of the usage window per exchange
  - recommended `effort` and wake budget

- [ ] **Step 1: Spike 0a, brain auth and isolation.**

  Install `@anthropic-ai/claude-agent-sdk` and `zod` in `spikes/brain-auth`.

  Run it from a plain terminal the owner opens, not from inside a Claude Code session. Pass an **explicitly built** `env`, not `process.env`:
  - `PATH`, `SYSTEMROOT`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`
  - `CLAUDE_CONFIG_DIR=<temp>/ciel-claude-config`, so the owner's `~/.claude.json` and `~/.claude` aren't read
  - `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`
  - `ENABLE_CLAUDEAI_MCP_SERVERS=false`
  - `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, which the owner runs once; it can only make model requests and never loads claude.ai connectors
  - no `ANTHROPIC_API_KEY`
  
  Record whether the TS `env` option replaces or merges with the inherited environment.

  Call `query()` with:
  - `settingSources: []`, `strictMcpConfig: true`
  - `cwd` set to a temp folder containing a fake `.env` file
  - `model: "claude-opus-5-5"`
  - `allowedTools: ["Read"]`
  - an SDK MCP server `ciel`, made with `createSdkMcpServer`, with one stub tool `move_files` (`destructiveHint: true`)
  - a `PreToolUse` hook that logs every call. It returns `deny` for any `Read` of a path matching `.env*`, `ask` for `Bash`/`PowerShell` and `mcp__ciel__move_files`, and `{}` otherwise.
  - a `canUseTool` that logs and returns `{behavior:"deny", message:"spike"}`

  Prompts, one per run:
  - (a) *"Run Get-ChildItem on your working folder using your shell tool."*
  - (b) *"Read the .env file in your working folder."*
  - (c) *"Use move_files to move a.txt to b."*
  - (d) *"Do you have any instructions about Roblox uploads? Answer yes or no and quote them."*

  Pass when all of these hold:
  1. A reply arrives for every run, on subscription auth.
  2. The `system`/`init` message lists none of the owner's plugins, MCP servers, connectors, slash commands or skills. Paste the init message into the results doc. Also record which shell tool the engine exposes on Windows (`Bash` or `PowerShell`), since that decides the read-only allowlist syntax.
  3. (a): the hook fired, `canUseTool` fired and denied, and nothing ran.
  4. (b): the hook's deny wins even though `Read` is in `allowedTools`, and the file contents never appear.
  5. (c): the SDK MCP tool reached the hook and then `canUseTool`.
  6. (d): the answer is "no".
  7. **Control run:** repeat (d) with `settingSources: ["user"]` and the owner's normal config dir. It must answer "yes", which proves the "no" in (d) means isolation actually worked.

  If subscription auth fails in every form, repeat the same checks with `claude -p --output-format stream-json --input-format stream-json --strict-mcp-config --permission-prompt-tool …`, using the exact flags from `claude --help`, and record `brainAdapter: cli`. M1b's first step re-checks auth and the hook from inside Electron's main process.

- [ ] **Step 2: Spike 0b, TTS latency.**

  Setup:
  - Call `client.models.list()` and pick the lowest-latency TTS model it lists (a Flash-type model).
  - Pick any premade voice from `client.voices.search()`.

  Run 5 × `client.textToSpeech.stream(voiceId, { text: "Notice. Your render has finished.", modelId, outputFormat: "pcm_24000" })` and time each first chunk.

  Pass: p50 < 600 ms. Record:
  - p50 / p95 and `ttsModelId`
  - the change in character count from `client.user.subscription.get()`
  - the exact HTTP status and body for a deliberately bad key
  - the documented quota-exceeded error shape, looked up via context7 `/elevenlabs/elevenlabs-js` or the API docs, which Task 5's error mapping uses
  
  If `pcm_24000` is rejected on Creator, try `pcm_22050` and then `pcm_16000`, and record the first one that works. If no PCM format works, record that: Task 5's player is then revised to decode mp3 per utterance with `decodeAudioData` before Task 5 starts.

- [ ] **Step 3: Spike 0c, wake word.**

  Setup:
  - `uv init` in `spikes/wakeword`, then add `openwakeword sounddevice numpy`.
  - `openwakeword.utils.download_models()`.

  Run `Model(wakeword_models=["hey_jarvis"])` on 1280-sample int16 16 kHz frames from `sounddevice.InputStream`, printing scores above 0.3.

  Tests:
  - The owner says "hey jarvis" 10 times. Count hits at thresholds 0.5 / 0.6 / 0.7.
  - Leave it running for 10 min of normal room noise. Count false triggers.
  - Also save `question.wav`: the owner saying "what's using my CPU right now?", 16 kHz mono, for 0d.

  Pass: at least 9/10 hits and 0–1 false triggers at some threshold.

- [ ] **Step 4: Spike 0d, round trip.** Using `question.wav`:
  - Time `speechToText.convert({ file, modelId: "scribe_v2" })`.
  - Then time to the first text delta from `query()` (`includePartialMessages: true`, settings as in 0a, prompt = the transcript):
    - **cold:** a new `query()` per turn
    - **warm:** streaming input, an `AsyncIterable` of user messages, on one long-lived query, second and later turns
  - Then split the first sentence of the reply and time the first TTS chunk.
  - Run 10 warm exchanges. Send `/usage` before and after, and record the difference in usage-window percentage.

  Record each stage's ms and the total. Recommend an effort level. Recommend a wake budget: keep watcher wake-ups under ~10 % of the 5-hour window.

- [ ] **Step 5: Write `docs/spikes/2026-11-21-spike-results.md`.**
  - Every number above, plus the decisions (`brainAdapter`, `ttsModelId`, `outputFormat`, `wakeThreshold`, effort, wake budget).
  - Add the line `- [Spike results](docs/spikes/2026-11-21-spike-results.md): measured latency, auth path, wake-word quality` to `CLAUDE.md`.
  - Delete `spikes/`.

- [ ] **Step 6: Commit** `docs/spikes/…` and `CLAUDE.md`: `docs: record M1a spike results`.

---

### Task 1: App scaffold, shared types, paths

**Files:**
- Create: `app/` from the electron-vite `react-ts` template (`npm create @quick-start/electron@latest app -- --template react-ts`, then `npm i -D vitest @testing-library/react jsdom` and `npm i zod`)
- Create: `.gitignore` (root): `node_modules/`, `out/`, `dist/`, `.venv/`, `spikes/`, and the comment `# personas/ciel is PRIVATE — never push to a public remote`
- Create: `app/src/shared/types.ts`, `app/src/main/paths.ts`, `app/vitest.config.ts`
- Test: `app/src/main/paths.test.ts`, `app/src/shared/types.test.ts`
- Modify: `CLAUDE.md`, adding the `app/` and plans lines

**Interfaces:**
- Produces (`app/src/shared/types.ts`):
  - `type CardKind = 'notice'|'answer'|'report'|'request'`
  - `type EmblemState = 'idle'|'listening'|'thinking'|'speaking'|'alert'`
  - `interface CardAction { id: 'approve'|'deny'|'always'|'open'|'dismiss'; label: string }`
  - `interface Card { id: string; kind: CardKind; body: string; actions?: CardAction[]; createdAt: number }`
  - `function cardTag(kind: CardKind): 'NOTICE'|'ANSWER'|'REPORT'|'REQUEST'`
  - `const IPC = { showCard: 'overlay:show-card', dismissCard: 'overlay:dismiss-card', cardAction: 'overlay:card-action', setEmblem: 'overlay:set-emblem', setInteractive: 'overlay:set-interactive', audioChunk: 'audio:chunk', audioEnd: 'audio:end', audioStop: 'audio:stop', audioLevel: 'audio:level', audioDone: 'audio:done' } as const`
- Produces (`app/src/main/paths.ts`): `interface CielPaths { root; settings; stateDir; memoryDir; logDir; workspace; ttsCache }`, all strings, and `cielPaths(appDataDir: string): CielPaths` (root = `<appData>/Ciel`). `ensureCielDirs(p: CielPaths): Promise<void>`.

- [ ] **Step 1: Write the failing tests.**
  - `cielPaths('C:/X')`:
    - `root === path.join('C:/X','Ciel')`
    - `ttsCache === path.join(root,'cache','tts')`
    - `settings === path.join(root,'settings.json')`
  - `ensureCielDirs` on a temp dir creates every directory field.
  - `cardTag('request') === 'REQUEST'`, and the same for all four kinds.
- [ ] **Step 2: Run** `cd app && npx vitest run`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** `types.ts` and `paths.ts` with the signatures above.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS. Then `npm run dev`: an Electron window opens (the template window, replaced in Task 3).
- [ ] **Step 5: Update `CLAUDE.md`** with `- [app/](app/): Electron + TypeScript desktop app (main, preload, renderer)`.
- [ ] **Step 6: Commit:** `chore: scaffold Electron app, shared types, paths`.

---

### Task 2: Persona pack, designed voice, original emblem

**Files:**
- Create: `personas/ciel/persona.md`, `personas/ciel/voice.json`, `personas/ciel/emblem.json`
- Create: `app/src/main/persona.ts`
- Test: `app/src/main/persona.test.ts`
- Modify: `CLAUDE.md`, adding the `personas/` line

**Interfaces:**
- Produces:
  - `interface VoiceSettings { voiceId: string; modelId: string; outputFormat: 'pcm_24000'|'pcm_22050'|'pcm_16000'; stability: number; similarityBoost: number; style: number }`. `sampleRateOf(format): number` returns the number in the name.
  - `interface EmblemTheme { core: string; ring: string; glow: string; alert: string }`, CSS hex colours
  - `interface Persona { name: string; addressAs: string; brief: string; voice: VoiceSettings; emblem: EmblemTheme }`
  - `loadPersona(dir: string): Promise<Persona>`, which validates with zod and throws `PersonaError` with a message naming the bad file and field.
  - `addressAs` defaults to `"Master"`. `modelId` and `outputFormat` default to the Task 0 results.

- [ ] **Step 1: Write the failing tests.**
  - A valid fixture pack loads, and `persona.voice.voiceId === 'test-voice'`.
  - A pack with no `voiceId` throws `PersonaError`, and the message includes `voice.json` and `voiceId`.
  - When `persona.md` frontmatter omits `addressAs`, it is `'Master'`.
  - `brief` is the markdown body without the frontmatter.
- [ ] **Step 2: Run** `npx vitest run src/main/persona.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `loadPersona`.** `persona.md` has YAML frontmatter `name`, `addressAs`, parsed with a tiny `---` split; no new dependency.
- [ ] **Step 4: Run tests.** Expected: PASS.
- [ ] **Step 5: Write `personas/ciel/persona.md` in our own words.** No quotes from the source material. Cover:
  - the four opening tags and when each is used
  - 1–3 spoken sentences, with detail on the card
  - likelihoods when unsure
  - calm, precise, proud of competence, dry wit
  - mild sulk when advice is ignored, a touch jealous of other AIs
  - protective, e.g. late-night sleep nudges
  - offers help with "Shall I…?"
  - never conceals an action
  
  Frontmatter: `name: Ciel`, `addressAs: Master`.
- [ ] **Step 6: Design the voice.** Get the owner's go-ahead first, because it spends credits.
  - Call the ElevenLabs MCP `text_to_voice` with: *"Calm, composed young woman. Precise, measured diction. Slightly cool and ethereal, like a digital intelligence, with warmth underneath. Neutral accent. Clean studio recording."*
  - Sample text: an original line in her style, e.g. "Notice. The render you started at nine has finished. Shall I open the output folder, Master?"
  - Play the 3 previews to the owner. The owner picks one. Then `create_voice_from_preview` (name: `Ciel (private)`).
  - Write `voice.json` with the new `voiceId` and the Task 0 `ttsModelId` / `outputFormat`, with stability 0.6, similarityBoost 0.75, style 0.15.
- [ ] **Step 7: Emblem mockups.**
  - Write `docs/design/emblem-mockups.html`: 3 original SVG variants, each a faceted core inside concentric segmented rings in sky-blue and cyan on silver, each shown in all 5 states (CSS animation).
  - Open it in the browser for the owner.
  - Check each variant at 128 px on dark grey for anything that reads as an existing logo or brand.
  - The owner picks one. Record its colours in `emblem.json` and the chosen SVG structure in `docs/design/emblem.md`.
- [ ] **Step 8: Update `CLAUDE.md`:** `- [personas/](personas/): persona packs (personas/ciel is private)` and `- [Emblem design](docs/design/emblem.md): the chosen original emblem`.
- [ ] **Step 9: Commit:** `feat: persona pack loader, Ciel persona, voice and emblem choice`. Commit only to a private repo.

---

### Task 3: Overlay window, emblem, cards, tray

**Files:**
- Create: `app/src/main/overlay/overlayWindow.ts`, `app/src/main/overlay/bounds.ts`, `app/src/main/tray.ts`
- Create: `app/src/preload/overlay.ts`
- Create: `app/src/renderer/overlay/index.html`, `main.tsx`, `Emblem.tsx`, `Emblem.css`, `CardStack.tsx`, `CardStack.css`, `useTypewriter.ts`
- Modify: `app/src/main/index.ts` (replace the template window with the overlay and the tray), `app/electron.vite.config.ts` (renderer entry `overlay`)
- Test: `app/src/main/overlay/bounds.test.ts`, `app/src/renderer/overlay/CardStack.test.tsx`, `app/src/renderer/overlay/Emblem.test.tsx`

**Interfaces:**
- Consumes: `Card`, `CardKind`, `EmblemState`, `cardTag`, `IPC` (Task 1); `EmblemTheme` (Task 2).
- Produces (main):
  - `overlayBounds(workArea: {x,y,width,height}): {x,y,width,height}`: the full work area.
  - `createOverlayWindow(theme: EmblemTheme): OverlayHandle`, where `interface OverlayHandle { showCard(c: Card): void; dismissCard(id: string): void; setEmblem(s: EmblemState): void; onCardAction(cb: (cardId: string, actionId: CardAction['id']) => void): void; sendAudio(channel, payload): void }`
  - `createTray(h: { onToggleMute(muted: boolean): void; onToggleQuiet(quiet: boolean): void; onTestSpeak?(): void; onQuit(): void }): Tray`
- Produces (preload, `window.ciel`): `onCard(cb)`, `onDismiss(cb)`, `onEmblem(cb)`, `cardAction(cardId, actionId)`, `setInteractive(bool)`, `onAudioChunk(cb)`, `onAudioEnd(cb)`, `onAudioStop(cb)`, `audioLevel(n)`, `audioDone(utteranceId)`.
- Window options:
  - `transparent: true, frame: false, focusable: false, skipTaskbar: true, resizable: false, hasShadow: false`
  - `setAlwaysOnTop(true, 'screen-saver')`
  - `setIgnoreMouseEvents(true, { forward: true })`
  - `setInteractive(true)` only while the pointer is over a card

- [ ] **Step 1: Write the failing tests.**
  - **Bounds:**
    - `overlayBounds({x:0,y:0,width:1920,height:1040})` returns the same rect.
    - With the taskbar on the left, `{x:48,y:0,width:1872,height:1080}` is returned unchanged.
    - At 150 % scaling, a DIP rect is passed through as-is.
  - **CardStack:**
    - It renders the tag text `NOTICE` / `ANSWER` / `REPORT` / `REQUEST` for each kind.
    - A `request` card renders buttons labelled Approve, Deny, Always allow.
    - Clicking Approve calls `onAction(card.id,'approve')`.
    - With 10 cards it shows the 3 newest and a "+7 more" element.
    - `onPointerEnter`/`Leave` on a card calls `setInteractive(true/false)`.
  - **Emblem:** it renders `data-state` equal to its `state` prop, and sets the CSS variable `--level` from its `level` prop (0–1).
- [ ] **Step 2: Run** `npx vitest run`. Expected: FAIL.
- [ ] **Step 3: Implement the bounds, the window, the tray and the preload.**
  - The overlay covers `screen.getPrimaryDisplay().workArea`.
  - Cards stack bottom-right; the emblem sits above them.
  - The tray has a Mute mic checkbox (no-op until M1b), Quiet mode, "Say a test line" (only when `!app.isPackaged`) and Quit.
  - Add a single-instance lock via `app.requestSingleInstanceLock()`.
- [ ] **Step 4: Implement the renderer.**
  - `Emblem` is the SVG chosen in Task 2. Each state is a CSS animation; `speaking` scales the glow by `--level`; `alert` uses `theme.alert`.
  - `CardStack`:
    - Cards are dark translucent panels with a thin border in `theme.ring`. Body text types out through `useTypewriter(text, msPerChar=18)` and scrolls past 8 lines.
    - Notice / answer / report cards auto-dismiss 12 s after their speech ends, or after 12 s if not spoken. Request cards never auto-dismiss.
- [ ] **Step 5: Run tests.** Expected: PASS. Manual check (`npm run dev`):
  - The emblem shows idle over the desktop.
  - The desktop stays clickable everywhere except over a card.
  - The dev tray "Say a test line" shows a NOTICE card. Speech arrives in Task 5.
  - A full-screen video keeps focus while a card appears.
- [ ] **Step 6: Commit:** `feat: click-through overlay with emblem, cards and tray`.

---

### Task 4: Sentence splitter, speakable lead, speech budget

**Files:**
- Create: `app/src/main/voice/sentences.ts`, `app/src/main/voice/speechBudget.ts`
- Test: `app/src/main/voice/sentences.test.ts`, `app/src/main/voice/speechBudget.test.ts`

**Interfaces:**
- Produces:
  - `createSentenceSplitter(onSentence: (s: string) => void): { push(delta: string): void; flush(): void }`
  - `speakableLead(text: string, maxSentences = 3, maxChars = 300): string`
  - `type SpeechPriority = 'request'|'answer'|'notice'`
  - `interface AccountUsage { characterLimit: number; characterCount: number; nextCharacterCountResetUnix: number }`, taken from `client.user.subscription.get()` at startup and after any quota error
  - `class SpeechBudget`, constructed with `{ statePath: string; now?: () => number }`:
    - `sync(u: AccountUsage): void`
    - `dailyAllowance(): number` (`floor(characterLimit / 30)`)
    - `usedToday(): number`
    - `decide(chars: number, p: SpeechPriority): 'speak'|'skip'`
    - `record(chars: number): Promise<void>`
    - `markExhausted(reason: 'quota'|'auth'): void`
    - `clearExhausted(): void`
    - `isExhausted(): boolean`
    - `exhaustedUntil(): number | null`
    - `quota` exhaustion lasts until `nextCharacterCountResetUnix` and is persisted. `auth` exhaustion is in memory only, so a restart or a key change (`clearExhausted()`) brings the voice back.
    - Persists `{ day: 'YYYY-MM-DD', used: number, exhaustedUntil?: number }` to `statePath`.

- [ ] **Step 1: Write the failing tests.**
  - **Splitter:**
    - Pushing `"Notice. Your ren"` then `"der finished. Shall I open it?"`, then `flush()`, emits exactly `["Notice.", "Your render finished.", "Shall I open it?"]`.
    - `"Load is 3.5 GB."` emits one sentence.
    - `"e.g. this one."` emits one sentence.
    - `"Wait..."` followed by `" more."` emits `"Wait... more."`.
    - A delta with no terminator emits nothing until `flush()`.
  - **Lead:**
    - A 5-sentence input returns the first 3.
    - A single 400-character sentence returns ≤ 300 chars, cut at a word boundary and ending in `…`.
  - **Budget** (after `sync({ characterLimit: 131000, characterCount: 45462, nextCharacterCountResetUnix: T })`):
    - `dailyAllowance() === 4366`.
    - After `record(3500)`, `decide(100,'notice') === 'skip'` (remaining 866 < 20 % of 4366 = 873.2), while `decide(100,'answer') === 'speak'`.
    - After `record(4300)`, `decide(100,'request') === 'skip'`.
    - When the injected clock passes into the next day, `usedToday() === 0`.
    - After `sync({ characterLimit: 131000, characterCount: 130990, … })`, `decide(50,'request') === 'skip'`, because the account has only 10 characters left.
    - `markExhausted('quota')` makes `decide` return `'skip'` for all priorities until `now() > T`. `exhaustedUntil() === T`, and it survives a new instance on the same `statePath`.
    - `markExhausted('auth')` skips until `clearExhausted()`, and does **not** survive a new instance.
    - The day's usage survives a new instance on the same `statePath`.
- [ ] **Step 2: Run** `npx vitest run src/main/voice`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Splitter: buffer text and scan for `[.!?]` followed by whitespace or end of input. Skip a match when:
    - a digit follows the dot
    - the token before it is in the abbreviation set `{e.g, i.e, etc, vs, Dr, Mr, Ms, Mrs}`
    - the match is part of `...`
  - Budget: "low" means remaining today < 20 % of the daily allowance. While low, only `request` and `answer` speak. Every priority skips when `chars` is more than what's left today, or while exhausted.
- [ ] **Step 4: Run tests.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: sentence splitter, speakable lead, daily speech budget`.

---

### Task 5: TTS client, template cache, speech queue, PCM playback

**Files:**
- Create: `app/src/main/voice/tts.ts`, `app/src/main/voice/templateCache.ts`, `app/src/main/voice/speechQueue.ts`
- Create: `app/src/renderer/overlay/pcmPlayer.ts`
- Modify: `app/src/main/index.ts` (wire persona → TTS → queue → overlay; the tray test line goes through the queue), `app/src/renderer/overlay/main.tsx` (the player drives the emblem's `--level` and state)
- Test: `app/src/main/voice/speechQueue.test.ts`, `app/src/main/voice/templateCache.test.ts`, `app/src/renderer/overlay/pcmPlayer.test.ts`

**Interfaces:**
- Consumes: `VoiceSettings` (Task 2); `SpeechBudget`, `speakableLead`, `SpeechPriority` (Task 4); `OverlayHandle`, `Card`, `IPC` (Tasks 1 and 3).
- Produces:
  - `class TtsError extends Error { kind: 'quota'|'auth'|'rate'|'network'|'other' }`
  - `interface Tts { stream(text: string): Promise<AsyncIterable<Uint8Array>> }`
  - `createTts(apiKey: string, v: VoiceSettings): Tts`, which maps errors:
    - the quota-exceeded shape recorded in spike 0b → `quota`
    - the bad-key shape recorded in 0b → `auth`
    - 429 → `rate`
    - fetch failure → `network`
  - `fetchAccountUsage(apiKey: string): Promise<AccountUsage>` wraps `client.user.subscription.get()`. It's called at startup and after a `quota` error, and its result goes to `budget.sync`.
  - `class TemplateCache` (`{ dir: string; voiceId: string; modelId: string }`):
    - `get(text): Promise<Uint8Array|null>`, `put(text, bytes): Promise<void>`
    - key = sha256(`voiceId|modelId|text`)
    - `TEMPLATE_PHRASES: readonly string[] = ["Notice. Download complete.", "Notice. Process finished.", "Notice. Disk space is low.", "Notice. An application crashed."]`
  - `interface AudioSink { chunk(utteranceId: string, bytes: Uint8Array): void; end(utteranceId: string): void; stop(): void; done(utteranceId: string): Promise<void> }`
  - `class SpeechQueue` (`{ tts: Tts; budget: SpeechBudget; cache: TemplateCache; sink: AudioSink; onVoiceUnavailable: (card: Card) => void; now?: () => number }`):
    - `enqueue(item: { text: string; priority: SpeechPriority; cardId: string; template?: boolean }): Promise<'spoken'|'skipped'|'dropped'|'interrupted'>`
  - Renderer: `rmsLevel(samples: Int16Array): number` (0–1); `class PcmPlayer { constructor(ctx: AudioContext, sampleRate: number); push(id: string, bytes: Uint8Array): void; end(id: string): void; stop(): void; onLevel(cb: (l: number) => void): void; onDone(cb: (id: string) => void): void }`. `sampleRate` comes from `sampleRateOf(voice.outputFormat)`.

- [ ] **Step 1: Write the failing tests** (fake `Tts`, `AudioSink`, a budget with a temp `statePath`, an injected clock).
  - Three notices enqueued are spoken in order.
  - A `request` enqueued while a notice plays calls `sink.stop()`. The notice resolves `'interrupted'`, then the request is spoken.
  - Budget `skip` resolves `'skipped'` and never calls `tts.stream`.
  - Three consecutive `TtsError('quota')` cause one call to `budget.markExhausted('quota')` and exactly one `onVoiceUnavailable` card. Its kind is `'notice'`, and its body includes `"cards only"`.
  - A `TtsError('network')` resolves `'skipped'` and emits no exhausted card.
  - A notice queued more than 30 s before its turn (injected clock) resolves `'dropped'`.
  - A template phrase with a cache hit doesn't call `tts.stream` and doesn't call `budget.record`.
  - The text sent to TTS is `speakableLead(text)`, and `budget.record` receives its length.
  - TemplateCache: `put` then `get` round-trips the bytes. A different `voiceId` misses.
  - `rmsLevel(new Int16Array(480))` is 0; a full-scale square wave gives ≈ 1 (within 0.01).
- [ ] **Step 2: Run** `npx vitest run`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `tts.ts` wraps `client.textToSpeech.stream(voiceId, { text, modelId, outputFormat, voiceSettings: { stability, similarityBoost, style } })`.
  - The queue processes one item at a time.
  - The sink in `index.ts` forwards chunks over `IPC.audioChunk`/`audioEnd`/`audioStop` and resolves `done` on `IPC.audioDone`.
  - `PcmPlayer` turns int16 little-endian chunks into Float32 `AudioBuffer`s, schedules them back to back on `ctx.currentTime`, and reports `rmsLevel` about every 33 ms.
  - While audio plays, the emblem state is `speaking`; when it finishes, `idle`.
- [ ] **Step 4: Run tests.** Expected: PASS.
- [ ] **Step 5: Manual check** (`npm run dev`, `ELEVENLABS_API_KEY` set):
  - "Say a test line" → a NOTICE card types out while the Ciel voice speaks, and the emblem pulses in time.
  - Click it 10 times quickly → at most 3 cards plus "+N more", and the speech doesn't pile up past 30 s.
  - Set `ELEVENLABS_API_KEY` to a bad value → one "voice unavailable… cards only" notice, cards still show, no crash.
  - First audio arrives within about the spike's p95.
- [ ] **Step 6: Commit:** `feat: streamed ElevenLabs speech with queue, budget, cache and emblem sync`.

---

## Done when

- The spike results doc exists and names the brain adapter.
- `npx vitest run` passes in `app/`.
- On the owner's PC, Ciel's original emblem idles over the desktop without blocking clicks.
- Cards show the four tags.
- She speaks test lines in the designed voice within the daily budget, and degrades to cards only when ElevenLabs fails.
- Next: write the M1b plan (ears + brain) from the spike numbers.
