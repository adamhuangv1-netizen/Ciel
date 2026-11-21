# Spike results (M1a, Task 0)

What the throwaway spikes measured, and what M1b builds on. The [design](../specs/2026-11-21-ciel-design.md) has the full context.

## Verdict

- **Brain adapter: the Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk` 0.3.330), not the `claude -p` fallback. It runs on the owner's Claude subscription login.
- **Voice: ElevenLabs streaming TTS**, `eleven_flash_v2_5` at `pcm_24000`. It's well inside the latency target.
- **Still open, both waiting on the owner:**
  - Wake word (0c) and the full voice round trip (0d) need the owner's microphone.
  - Token mode for the brain (0a) needs the owner to run `claude setup-token`.

## 0a: Agent SDK on the subscription — pass

- **Login:**
  - `query()` ran with `ANTHROPIC_API_KEY` unset, and `apiKeySource` reported `none` (subscription login).
  - The model served was `claude-opus-5-5`.
  - A cold single-turn run took about 7–9 s.
- **Isolation from the owner's Claude Code setup:** proven with the owner's real `~/.claude` present.
  - With `settingSources: []`, the owner's CLAUDE.md, plugins and MCP servers didn't load.
  - A control run with `settingSources: ["user"]` did quote the owner's global CLAUDE.md.
  - The TypeScript `env` option replaces the inherited environment rather than merging with it.
- **The gate:** `PreToolUse` hooks are the gate.
  - A hook returning `ask` reached `canUseTool`, which denied it, and nothing ran.
  - A hook `deny` beat `allowedTools`.
  - An SDK MCP tool sat behind ToolSearch at first, then went through the same hook and `canUseTool` path.
- **For M1b:**
  - The init message still lists 33 built-in tools and the bundled skills, so pass an explicit `tools` list.
  - Set `alwaysLoad` on Ciel's MCP server.
  - Never put bare tool names in `allowedTools`: it shadows `canUseTool`.
- **Pending:** token mode (`CLAUDE_CONFIG_DIR` plus a `claude setup-token` token in `CLAUDE_CODE_OAUTH_TOKEN`) needs the owner to run `claude setup-token`.

## 0b: ElevenLabs TTS latency — pass

These times are to the first audio chunk, at `pcm_24000` on the Creator plan, with a premade voice and 5 runs each:

| Model | p50 | p95 |
|---|---|---|
| `eleven_flash_v2_5` | 151 ms | 185 ms |
| `eleven_turbo_v2_5` | 151 ms | 163 ms |
| `eleven_v4_turbo` | 172 ms | 179 ms |

- **All three are well under the 600 ms target**, and all three have a cost factor of 0.5. The default is `eleven_flash_v2_5`; `eleven_v4_turbo` is the alternative if the designed voice sounds better on it.
- **In the app (Task 5):** a queued line's first audio arrived 131–168 ms after queueing.
- **Usage reporting lags:** the subscription's `characterCount` didn't change straight after 15 short runs, so the speech budget counts characters locally.
- **Error shapes:**
  - A bad key gives 401 `{detail: {type: "authentication_error", code: "unauthorized", status: "invalid_api_key"}}`.
  - Using a key ID instead of the key gives 400 `authentication_error` / `invalid_api_key`.
  - Running out of quota gives `quota_exceeded`, also as a 401 according to ElevenLabs' docs, so the voice code checks for quota before auth.

## 0c: Wake word — pending (needs the owner's microphone)

- **Test:** openWakeWord's pretrained `hey_jarvis` on the owner's mic.
  - Say it 10 times.
  - Then 10 minutes of normal room noise, counting false triggers.
  - Save a spoken question as `question.wav` for 0d.

## 0d: Full voice round trip — pending (needs 0c)

- **Test:** time from the end of speech to the first audio, through STT, the brain and TTS.
- **Compare:** a cold engine against a warm session.
- **Record:** the subscription usage before and after 10 exchanges (`/usage`). These numbers set the wake budget and the default effort.
