import { describe, it, expect, vi, afterEach } from 'vitest'
import { ElevenLabsError, ElevenLabsTimeoutError } from '@elevenlabs/elevenlabs-js'
import { classifyTtsError, guardStalls, TtsError } from './tts'

const api = (statusCode: number, detail: Record<string, string>): ElevenLabsError =>
  new ElevenLabsError({ statusCode, body: { detail } })

describe('classifyTtsError', () => {
  it('treats an exhausted character quota as quota', () => {
    expect(
      classifyTtsError(
        api(401, { status: 'quota_exceeded', message: 'This request exceeds your quota.' })
      )
    ).toBe('quota')
    expect(
      classifyTtsError(api(402, { type: 'payment_required', code: 'insufficient_credits' }))
    ).toBe('quota')
  })

  it('treats a rejected key as auth (the shapes spike 0b recorded)', () => {
    const bad = { type: 'authentication_error', code: 'unauthorized', status: 'invalid_api_key' }
    expect(classifyTtsError(api(401, bad))).toBe('auth')
    expect(
      classifyTtsError(api(400, { type: 'authentication_error', status: 'invalid_api_key' }))
    ).toBe('auth')
  })

  it('treats 429 as rate limiting', () => {
    expect(classifyTtsError(api(429, { status: 'too_many_concurrent_requests' }))).toBe('rate')
  })

  it('treats a request that never got a response as network', () => {
    expect(classifyTtsError(new ElevenLabsError({ message: 'fetch failed' }))).toBe('network')
    expect(classifyTtsError(new ElevenLabsTimeoutError('Timeout exceeded'))).toBe('network')
    expect(classifyTtsError(new TypeError('fetch failed'))).toBe('network')
  })

  it('treats anything else as other', () => {
    expect(classifyTtsError(api(500, { status: 'internal_error' }))).toBe('other')
    expect(classifyTtsError(api(404, { status: 'voice_not_found' }))).toBe('other')
  })

  it('keeps an existing TtsError kind', () => {
    expect(classifyTtsError(new TtsError('auth', 'x'))).toBe('auth')
  })
})

describe('guardStalls', () => {
  afterEach(() => vi.useRealTimers())

  it('passes a steady stream through', async () => {
    async function* steady(): AsyncIterable<Uint8Array> {
      yield new Uint8Array([1])
      yield new Uint8Array([2])
    }
    const out: number[] = []
    for await (const c of guardStalls(steady(), 1_000)) out.push(c[0]!)
    expect(out).toEqual([1, 2])
  })

  it('gives up with a network error when the stream goes quiet', async () => {
    vi.useFakeTimers()
    async function* stalls(): AsyncIterable<Uint8Array> {
      yield new Uint8Array([1])
      await new Promise(() => {}) // never sends another chunk
    }
    const out: number[] = []
    const run = (async () => {
      for await (const c of guardStalls(stalls(), 8_000)) out.push(c[0]!)
    })()
    const result = run.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(8_100)
    const err = await result
    expect(out).toEqual([1])
    expect(err).toBeInstanceOf(TtsError)
    expect((err as TtsError).kind).toBe('network')
  })
})
