import { ElevenLabsClient, ElevenLabsError, ElevenLabsTimeoutError } from '@elevenlabs/elevenlabs-js'
import type { VoiceSettings } from '../persona'
import type { AccountUsage } from './speechBudget'

export type TtsErrorKind = 'quota' | 'auth' | 'rate' | 'network' | 'other'

export class TtsError extends Error {
  override name = 'TtsError'
  constructor(
    readonly kind: TtsErrorKind,
    message: string
  ) {
    super(message)
  }
}

export interface Tts {
  stream(text: string): Promise<AsyncIterable<Uint8Array>>
}

function detailOf(body: unknown): Record<string, unknown> {
  const detail = (body as { detail?: unknown } | null | undefined)?.detail
  return detail && typeof detail === 'object' ? (detail as Record<string, unknown>) : {}
}

/**
 * Maps an ElevenLabs failure to what the speech queue does about it. Quota is checked first:
 * ElevenLabs reports it as a 401 too. Shapes: docs (help-center 400/401, errors) and spike 0b.
 */
export function classifyTtsError(e: unknown): TtsErrorKind {
  if (e instanceof TtsError) return e.kind
  if (e instanceof ElevenLabsTimeoutError) return 'network'
  if (e instanceof ElevenLabsError) {
    if (e.statusCode === undefined) return 'network'
    const d = detailOf(e.body)
    const tags = [d['status'], d['code'], d['type']]
    if (e.statusCode === 402 || tags.some((t) => t === 'quota_exceeded' || t === 'insufficient_credits' || t === 'payment_required'))
      return 'quota'
    if (tags.some((t) => t === 'invalid_api_key' || t === 'authentication_error' || t === 'missing_permissions'))
      return 'auth'
    if (e.statusCode === 429 || d['type'] === 'rate_limit_error') return 'rate'
    return 'other'
  }
  if (e instanceof TypeError) return 'network' // fetch() rejects with TypeError when the request never gets out
  return 'other'
}

function toTtsError(e: unknown): TtsError {
  if (e instanceof TtsError) return e
  return new TtsError(classifyTtsError(e), e instanceof Error ? e.message : String(e))
}

/** Re-throws mid-stream failures as TtsError so the queue sees one error type. */
async function* mapped(stream: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
  const reader = stream.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read().catch((e: unknown) => {
        throw toTtsError(e)
      })
      if (done) return
      yield value
    }
  } finally {
    reader.releaseLock()
    void stream.cancel().catch(() => {})
  }
}

export function createTts(apiKey: string, v: VoiceSettings): Tts {
  const client = new ElevenLabsClient({ apiKey })
  return {
    async stream(text) {
      try {
        const stream = await client.textToSpeech.stream(v.voiceId, {
          text,
          modelId: v.modelId,
          outputFormat: v.outputFormat,
          voiceSettings: { stability: v.stability, similarityBoost: v.similarityBoost, style: v.style }
        })
        return mapped(stream)
      } catch (e) {
        throw toTtsError(e)
      }
    }
  }
}

/** The account's character usage, for SpeechBudget.sync. Called at startup and after a quota error. */
export async function fetchAccountUsage(apiKey: string): Promise<AccountUsage> {
  try {
    const s = await new ElevenLabsClient({ apiKey }).user.subscription.get()
    return {
      characterLimit: s.characterLimit,
      characterCount: s.characterCount,
      // Unknown reset time: check again in a day.
      nextCharacterCountResetUnix: s.nextCharacterCountResetUnix ?? Math.floor(Date.now() / 1000) + 86_400
    }
  } catch (e) {
    throw toTtsError(e)
  }
}
