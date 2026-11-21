import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Card } from '../../shared/types'
import { SpeechQueue, type AudioSink, type SpeechQueueOptions } from './speechQueue'
import { TtsError, type Tts } from './tts'
import { TemplateCache } from './templateCache'
import { SpeechBudget } from './speechBudget'
import { speakableLead } from './sentences'

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ciel-queue-'))
})

function fakeTts(fail?: (text: string) => Error | undefined): { tts: Tts; texts: string[] } {
  const texts: string[] = []
  const tts: Tts = {
    async stream(text) {
      texts.push(text)
      const e = fail?.(text)
      if (e) throw e
      return (async function* () {
        yield new Uint8Array([1, 2])
        yield new Uint8Array([3, 4])
      })()
    }
  }
  return { tts, texts }
}

/** A sink whose playback finishes at once (auto) or when the test calls finish(). */
function fakeSink(auto = true): { sink: AudioSink; calls: string[]; finish(): void; pending(): number } {
  const calls: string[] = []
  const waiters = new Map<string, () => void>()
  const sink: AudioSink = {
    chunk: (_id, bytes) => calls.push(`chunk ${bytes.length}`),
    end: () => calls.push('end'),
    stop: () => calls.push('stop'),
    done: (id) => (auto ? Promise.resolve() : new Promise<void>((r) => waiters.set(id, r)))
  }
  return {
    sink,
    calls,
    finish: () => {
      for (const [id, r] of waiters) {
        waiters.delete(id)
        r()
      }
    },
    pending: () => waiters.size
  }
}

function syncedBudget(): SpeechBudget {
  const b = new SpeechBudget({ statePath: path.join(dir, 'budget.json') })
  b.sync({
    characterLimit: 3_000_000,
    characterCount: 0,
    nextCharacterCountResetUnix: Math.floor(Date.now() / 1000) + 86_400
  })
  return b
}

function makeQueue(over: Partial<SpeechQueueOptions> = {}): SpeechQueue {
  return new SpeechQueue({
    tts: fakeTts().tts,
    budget: syncedBudget(),
    cache: new TemplateCache({ dir: path.join(dir, 'tts'), voiceId: 'v1', modelId: 'm1' }),
    sink: fakeSink().sink,
    onVoiceUnavailable: () => {},
    ...over
  })
}

describe('SpeechQueue', () => {
  it('speaks three notices one after another, in order', async () => {
    const { tts, texts } = fakeTts()
    const q = makeQueue({ tts })
    const results = await Promise.all(
      ['One.', 'Two.', 'Three.'].map((text, i) => q.enqueue({ text, priority: 'notice', cardId: `c${i}` }))
    )
    expect(results).toEqual(['spoken', 'spoken', 'spoken'])
    expect(texts).toEqual(['One.', 'Two.', 'Three.'])
  })

  it('cuts off a notice when a request arrives, then speaks the request', async () => {
    const { tts, texts } = fakeTts()
    const s = fakeSink(false)
    const q = makeQueue({ tts, sink: s.sink })
    const notice = q.enqueue({ text: 'Your download finished.', priority: 'notice', cardId: 'n' })
    await vi.waitFor(() => expect(s.pending()).toBe(1))

    const request = q.enqueue({ text: 'May I tidy Downloads?', priority: 'request', cardId: 'r' })
    expect(await notice).toBe('interrupted')
    expect(s.calls).toContain('stop')
    await vi.waitFor(() => expect(s.pending()).toBe(2))
    expect(texts).toEqual(['Your download finished.', 'May I tidy Downloads?'])
    s.finish()
    expect(await request).toBe('spoken')
  })

  it('skips without calling TTS when the budget says skip', async () => {
    const { tts, texts } = fakeTts()
    const unsynced = new SpeechBudget({ statePath: path.join(dir, 'fresh.json') }) // allowance 0
    const q = makeQueue({ tts, budget: unsynced })
    expect(await q.enqueue({ text: 'Hello.', priority: 'answer', cardId: 'a' })).toBe('skipped')
    expect(texts).toEqual([])
  })

  it('marks the quota exhausted once and shows exactly one cards-only notice', async () => {
    const { tts } = fakeTts(() => new TtsError('quota', 'quota exceeded'))
    const budget = syncedBudget()
    const mark = vi.spyOn(budget, 'markExhausted')
    const cards: Card[] = []
    const q = makeQueue({ tts, budget, onVoiceUnavailable: (c) => cards.push(c) })
    const results = await Promise.all(
      [1, 2, 3].map((i) => q.enqueue({ text: `Answer ${i}.`, priority: 'answer', cardId: `c${i}` }))
    )
    expect(results).toEqual(['skipped', 'skipped', 'skipped'])
    expect(mark).toHaveBeenCalledTimes(1)
    expect(mark).toHaveBeenCalledWith('quota')
    expect(cards).toHaveLength(1)
    expect(cards[0]!.kind).toBe('notice')
    expect(cards[0]!.body).toContain('cards only')
  })

  it('refreshes the account usage after a quota error, before marking it exhausted', async () => {
    const { tts } = fakeTts(() => new TtsError('quota', 'quota exceeded'))
    const budget = syncedBudget()
    const order: string[] = []
    vi.spyOn(budget, 'markExhausted').mockImplementation(() => void order.push('mark'))
    const q = makeQueue({ tts, budget, refreshUsage: async () => void order.push('refresh') })
    await q.enqueue({ text: 'Hi.', priority: 'answer', cardId: 'a' })
    expect(order).toEqual(['refresh', 'mark'])
  })

  it('shows one cards-only notice when the key is rejected', async () => {
    const { tts } = fakeTts(() => new TtsError('auth', 'bad key'))
    const budget = syncedBudget()
    const mark = vi.spyOn(budget, 'markExhausted')
    const cards: Card[] = []
    const q = makeQueue({ tts, budget, onVoiceUnavailable: (c) => cards.push(c) })
    await q.enqueue({ text: 'One.', priority: 'answer', cardId: 'a' })
    await q.enqueue({ text: 'Two.', priority: 'answer', cardId: 'b' })
    expect(mark).toHaveBeenCalledWith('auth')
    expect(cards).toHaveLength(1)
    expect(cards[0]!.body).toContain('cards only')
  })

  it('skips on a network error without an exhausted card', async () => {
    const { tts } = fakeTts(() => new TtsError('network', 'offline'))
    const budget = syncedBudget()
    const mark = vi.spyOn(budget, 'markExhausted')
    const cards: Card[] = []
    const q = makeQueue({ tts, budget, onVoiceUnavailable: (c) => cards.push(c) })
    expect(await q.enqueue({ text: 'Hi.', priority: 'answer', cardId: 'a' })).toBe('skipped')
    expect(cards).toEqual([])
    expect(mark).not.toHaveBeenCalled()
  })

  it('stops the audio if the stream fails part-way', async () => {
    const s = fakeSink()
    const tts: Tts = {
      async stream() {
        return (async function* () {
          yield new Uint8Array([1, 2])
          throw new TypeError('fetch failed')
        })()
      }
    }
    const q = makeQueue({ tts, sink: s.sink })
    expect(await q.enqueue({ text: 'Hi.', priority: 'answer', cardId: 'a' })).toBe('skipped')
    expect(s.calls).toEqual(['chunk 2', 'stop'])
  })

  it('drops a notice that waited more than 30 s for its turn', async () => {
    let t = 0
    const { tts, texts } = fakeTts()
    const s = fakeSink(false)
    const q = makeQueue({ tts, sink: s.sink, now: () => t })
    const first = q.enqueue({ text: 'First.', priority: 'notice', cardId: 'a' })
    const second = q.enqueue({ text: 'Second.', priority: 'notice', cardId: 'b' })
    const answer = q.enqueue({ text: 'An answer.', priority: 'answer', cardId: 'c' })
    await vi.waitFor(() => expect(s.pending()).toBe(1))
    t = 31_000
    s.finish()
    expect(await first).toBe('spoken')
    expect(await second).toBe('dropped')
    await vi.waitFor(() => expect(s.pending()).toBe(1))
    s.finish()
    expect(await answer).toBe('spoken') // answers are never dropped for waiting
    expect(texts).toEqual(['First.', 'An answer.'])
  })

  it('plays a cached template phrase without TTS or budget', async () => {
    const { tts, texts } = fakeTts()
    const budget = syncedBudget()
    const record = vi.spyOn(budget, 'record')
    const cache = new TemplateCache({ dir: path.join(dir, 'tts'), voiceId: 'v1', modelId: 'm1' })
    await cache.put('Notice. Download complete.', new Uint8Array([9, 9, 9, 9]))
    const s = fakeSink()
    const q = makeQueue({ tts, budget, cache, sink: s.sink })
    const r = await q.enqueue({ text: 'Notice. Download complete.', priority: 'notice', cardId: 'd', template: true })
    expect(r).toBe('spoken')
    expect(texts).toEqual([])
    expect(record).not.toHaveBeenCalled()
    expect(s.calls).toEqual(['chunk 4', 'end'])
  })

  it('caches a template phrase the first time it is spoken', async () => {
    const cache = new TemplateCache({ dir: path.join(dir, 'tts'), voiceId: 'v1', modelId: 'm1' })
    const q = makeQueue({ cache })
    await q.enqueue({ text: 'Notice. Process finished.', priority: 'notice', cardId: 'p', template: true })
    expect(await cache.get('Notice. Process finished.')).toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  it('sends only the speakable lead to TTS and records its length', async () => {
    const { tts, texts } = fakeTts()
    const budget = syncedBudget()
    const record = vi.spyOn(budget, 'record')
    const q = makeQueue({ tts, budget })
    const long = 'One. Two. Three. Four. Five.'
    await q.enqueue({ text: long, priority: 'answer', cardId: 'x' })
    expect(texts).toEqual([speakableLead(long)])
    expect(record).toHaveBeenCalledWith(speakableLead(long).length)
  })

  it('stays silent in quiet mode', async () => {
    const { tts, texts } = fakeTts()
    const q = makeQueue({ tts })
    q.setQuiet(true)
    expect(await q.enqueue({ text: 'Hello.', priority: 'answer', cardId: 'a' })).toBe('skipped')
    expect(texts).toEqual([])
  })
})
