import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PcmPlayer, rmsLevel } from './pcmPlayer'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

class FakeBuffer {
  readonly data: Float32Array
  constructor(
    readonly length: number,
    readonly sampleRate: number
  ) {
    this.data = new Float32Array(length)
  }
  get duration(): number {
    return this.length / this.sampleRate
  }
  copyToChannel(src: Float32Array): void {
    this.data.set(src)
  }
}

interface FakeSource {
  buffer: FakeBuffer | null
  onended: (() => void) | null
  startAt: number | null
  stopped: boolean
  connect(): void
  start(when: number): void
  stop(): void
}

function fakeContext(): { ctx: AudioContext; sources: FakeSource[]; clock: { now: number } } {
  const sources: FakeSource[] = []
  const clock = { now: 0 }
  const ctx = {
    get currentTime() {
      return clock.now
    },
    state: 'running',
    resume: async () => {},
    destination: {},
    createBuffer: (_channels: number, length: number, rate: number) => new FakeBuffer(length, rate),
    createBufferSource: () => {
      const s: FakeSource = {
        buffer: null,
        onended: null,
        startAt: null,
        stopped: false,
        connect: () => {},
        start(when) {
          s.startAt = when
        },
        stop() {
          s.stopped = true
        }
      }
      sources.push(s)
      return s
    }
  }
  return { ctx: ctx as unknown as AudioContext, sources, clock }
}

/** Little-endian int16 bytes for these samples. */
function pcm(samples: number[]): Uint8Array {
  const out = new Uint8Array(samples.length * 2)
  const view = new DataView(out.buffer)
  samples.forEach((s, i) => view.setInt16(i * 2, s, true))
  return out
}

describe('rmsLevel', () => {
  it('is 0 for silence', () => {
    expect(rmsLevel(new Int16Array(480))).toBe(0)
  })

  it('is about 1 for a full-scale square wave', () => {
    const square = Int16Array.from({ length: 480 }, (_, i) => (i % 2 ? 32767 : -32768))
    expect(rmsLevel(square)).toBeCloseTo(1, 2)
  })
})

describe('PcmPlayer', () => {
  it('rejoins a sample split across two chunks', () => {
    const { ctx, sources } = fakeContext()
    const player = new PcmPlayer(ctx, 24_000)
    const bytes = pcm([16384, -16384])
    player.push('u1', bytes.slice(0, 1))
    player.push('u1', bytes.slice(1))
    const samples = sources.flatMap((s) => Array.from(s.buffer!.data))
    expect(samples).toEqual([0.5, -0.5])
  })

  it('schedules chunks back to back', () => {
    const { ctx, sources } = fakeContext()
    const player = new PcmPlayer(ctx, 24_000)
    player.push('u1', pcm(new Array(2400).fill(100))) // 0.1 s
    player.push('u1', pcm(new Array(2400).fill(100)))
    const [a, b] = sources
    expect(b!.startAt! - a!.startAt!).toBeCloseTo(0.1, 6)
  })

  it('reports done once the last chunk of an ended utterance has played', () => {
    const { ctx, sources } = fakeContext()
    const player = new PcmPlayer(ctx, 24_000)
    const done = vi.fn()
    player.onDone(done)
    player.push('u1', pcm([1, 2, 3]))
    player.push('u1', pcm([4, 5, 6]))
    player.end('u1')
    sources[0]!.onended?.()
    expect(done).not.toHaveBeenCalled()
    sources[1]!.onended?.()
    expect(done).toHaveBeenCalledWith('u1')
  })

  it('reports done at once for an utterance that ends with no audio', () => {
    const { ctx } = fakeContext()
    const player = new PcmPlayer(ctx, 24_000)
    const done = vi.fn()
    player.onDone(done)
    player.end('empty')
    expect(done).toHaveBeenCalledWith('empty')
  })

  it('reports the loudness of what is playing about every 33 ms, and 0 after', () => {
    const { ctx, clock } = fakeContext()
    const player = new PcmPlayer(ctx, 24_000)
    const levels: number[] = []
    player.onLevel((l) => levels.push(l))
    const square = Array.from({ length: 2400 }, (_, i) => (i % 2 ? 32767 : -32768))
    player.push('u1', pcm(square))
    clock.now = 0.05
    vi.advanceTimersByTime(33)
    expect(levels.at(-1)).toBeCloseTo(1, 2)
    clock.now = 0.5
    vi.advanceTimersByTime(33)
    expect(levels.at(-1)).toBe(0)
  })

  it('stop silences everything without reporting done', () => {
    const { ctx, sources } = fakeContext()
    const player = new PcmPlayer(ctx, 24_000)
    const done = vi.fn()
    const levels: number[] = []
    player.onDone(done)
    player.onLevel((l) => levels.push(l))
    player.push('u1', pcm([1, 2, 3]))
    player.end('u1')
    player.stop()
    expect(sources.every((s) => s.stopped)).toBe(true)
    sources[0]!.onended?.()
    expect(done).not.toHaveBeenCalled()
    expect(levels.at(-1)).toBe(0)
  })
})
