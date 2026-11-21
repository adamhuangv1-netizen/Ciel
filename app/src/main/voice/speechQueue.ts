import { randomUUID } from 'node:crypto'
import type { Card } from '../../shared/types'
import { speakableLead } from './sentences'
import type { SpeechBudget, SpeechPriority } from './speechBudget'
import type { TemplateCache } from './templateCache'
import { classifyTtsError, type Tts } from './tts'

/** Where audio goes: the overlay's player (see audioSink.ts). */
export interface AudioSink {
  chunk(utteranceId: string, bytes: Uint8Array): void
  end(utteranceId: string): void
  stop(): void
  done(utteranceId: string): Promise<void>
}

export interface SpeechItem {
  text: string
  priority: SpeechPriority
  cardId: string
  template?: boolean
}

export type SpeechOutcome = 'spoken' | 'skipped' | 'dropped' | 'interrupted'

export interface SpeechQueueOptions {
  tts: Tts
  budget: SpeechBudget
  cache: TemplateCache
  sink: AudioSink
  onVoiceUnavailable: (card: Card) => void
  /** Re-reads the account usage into the budget; called after a quota error. */
  refreshUsage?: () => Promise<void>
  now?: () => number
}

/** Notices still waiting after this long are stale and dropped. */
export const MAX_NOTICE_WAIT_MS = 30_000
/** After this many failures in a row reaching ElevenLabs, say once that it's cards only. */
const OUTAGE_AFTER = 3
/** A failed account reading is retried no sooner than this. */
const REFRESH_RETRY_MS = 60_000

interface Pending {
  item: SpeechItem
  enqueuedAt: number
  resolve: (o: SpeechOutcome) => void
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

function clock(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Speaks one item at a time. A request cuts off whatever non-request is playing and goes ahead
 * of queued notices and answers. Failures never throw: the item resolves 'skipped' and cards carry on.
 */
export class SpeechQueue {
  private readonly o: SpeechQueueOptions
  private readonly now: () => number
  private readonly waiting: Pending[] = []
  private current: { item: SpeechItem; interrupt: () => void } | null = null
  private running = false
  private quiet = false
  private lastRefresh = Number.NEGATIVE_INFINITY
  private failuresInARow = 0
  private outageShown = false

  constructor(opts: SpeechQueueOptions) {
    this.o = opts
    this.now = opts.now ?? Date.now
  }

  setQuiet(on: boolean): void {
    this.quiet = on
    if (on) this.current?.interrupt()
  }

  enqueue(item: SpeechItem): Promise<SpeechOutcome> {
    return new Promise((resolve) => {
      const p: Pending = { item, enqueuedAt: this.now(), resolve }
      if (item.priority === 'request') {
        const at = this.waiting.findIndex((w) => w.item.priority !== 'request')
        if (at < 0) this.waiting.push(p)
        else this.waiting.splice(at, 0, p)
        if (this.current && this.current.item.priority !== 'request') this.current.interrupt()
      } else {
        this.waiting.push(p)
      }
      void this.pump()
    })
  }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      for (let p = this.waiting.shift(); p; p = this.waiting.shift()) {
        p.resolve(await this.play(p).catch(() => 'skipped' as const))
      }
    } finally {
      this.running = false
    }
  }

  private async play(p: Pending): Promise<SpeechOutcome> {
    const { item } = p
    if (item.priority === 'notice' && this.now() - p.enqueuedAt > MAX_NOTICE_WAIT_MS)
      return 'dropped'
    if (this.quiet) return 'skipped'
    const text = speakableLead(item.text)
    if (!text) return 'skipped'

    const id = randomUUID()
    const { sink } = this.o
    const abort = new AbortController()
    let interrupted = false
    let wake: () => void = () => {}
    const cut = new Promise<'interrupted'>((r) => (wake = () => r('interrupted')))
    this.current = {
      item,
      interrupt: () => {
        if (interrupted) return
        interrupted = true
        abort.abort()
        sink.stop()
        wake()
      }
    }
    const finish = (): Promise<SpeechOutcome> =>
      Promise.race([sink.done(id).then(() => 'spoken' as const), cut])

    try {
      if (item.template) {
        const hit = await this.o.cache.get(text)
        if (interrupted) return 'interrupted'
        if (hit) {
          sink.chunk(id, hit)
          sink.end(id)
          return await finish()
        }
      }
      await this.refreshIfDue()
      if (this.o.budget.decide(text.length, item.priority) === 'skip') return 'skipped'

      let stream: AsyncIterable<Uint8Array>
      try {
        stream = await this.o.tts.stream(text, abort.signal)
      } catch (e) {
        if (interrupted) return 'interrupted'
        return await this.failed(e)
      }
      if (interrupted) return 'interrupted'
      await this.o.budget.record(text.length)

      const parts: Uint8Array[] = []
      try {
        for await (const bytes of stream) {
          if (interrupted) break
          sink.chunk(id, bytes)
          parts.push(bytes)
        }
      } catch (e) {
        if (interrupted) return 'interrupted'
        sink.stop()
        return await this.failed(e)
      }
      if (interrupted) return 'interrupted'
      this.failuresInARow = 0
      this.outageShown = false
      sink.end(id)
      if (item.template) await this.o.cache.put(text, concat(parts)).catch(() => {})
      return await finish()
    } finally {
      this.current = null
    }
  }

  /** Re-reads the account when the budget asks (first use, after the monthly reset, every 6 h). */
  private async refreshIfDue(): Promise<void> {
    const { refreshUsage, budget } = this.o
    if (!refreshUsage || !budget.syncDue() || this.now() - this.lastRefresh < REFRESH_RETRY_MS)
      return
    this.lastRefresh = this.now()
    await refreshUsage().catch(() => {})
  }

  private async failed(e: unknown): Promise<SpeechOutcome> {
    const kind = classifyTtsError(e)
    if (kind === 'network' || kind === 'other') {
      this.failuresInARow++
      if (this.failuresInARow >= OUTAGE_AFTER && !this.outageShown) {
        this.outageShown = true
        this.o.onVoiceUnavailable({
          id: randomUUID(),
          kind: 'notice',
          body: "I can't reach ElevenLabs right now, so it's cards only until it answers again.",
          createdAt: this.now()
        })
      }
      return 'skipped'
    }
    if (kind !== 'quota' && kind !== 'auth') return 'skipped'
    const { budget } = this.o
    const alreadyOut = budget.isExhausted()
    if (kind === 'quota') await this.o.refreshUsage?.().catch(() => {})
    budget.markExhausted(kind)
    if (!alreadyOut) {
      const until = budget.exhaustedUntil()
      const body =
        kind === 'quota'
          ? `My voice is out of ElevenLabs characters${until ? ` until ${clock(until)}` : ''}, so it's cards only until then.`
          : `ElevenLabs rejected my voice key, so it's cards only until the key is fixed.`
      this.o.onVoiceUnavailable({ id: randomUUID(), kind: 'notice', body, createdAt: this.now() })
    }
    return 'skipped'
  }
}
