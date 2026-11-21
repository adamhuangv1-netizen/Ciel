/** How often the player reports loudness (drives the mouth and the emblem's glow). */
const LEVEL_INTERVAL_MS = 33
/** Small scheduling lead so the first chunk never starts in the past. */
const LEAD_S = 0.02

/** Root-mean-square loudness of 16-bit samples, 0 (silence) to 1 (full scale). */
export function rmsLevel(samples: Int16Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (const s of samples) {
    const f = s / 32768
    sum += f * f
  }
  return Math.min(1, Math.sqrt(sum / samples.length))
}

interface Segment {
  start: number
  end: number
  /** Seconds per level window. */
  window: number
  levels: number[]
}

/**
 * Plays streamed 16-bit little-endian mono PCM gap-free: each chunk becomes an AudioBuffer scheduled
 * right after the previous one. A sample split across two chunks is rejoined.
 */
export class PcmPlayer {
  private readonly ctx: AudioContext
  private readonly rate: number
  private nextTime = 0
  private readonly carry = new Map<string, number>()
  private readonly live = new Map<string, Set<AudioBufferSourceNode>>()
  private readonly ended = new Set<string>()
  private segments: Segment[] = []
  private readonly levelCbs: ((l: number) => void)[] = []
  private readonly doneCbs: ((id: string) => void)[] = []
  private lastLevel = 0
  private readonly timer: ReturnType<typeof setInterval>

  constructor(ctx: AudioContext, sampleRate: number) {
    this.ctx = ctx
    this.rate = sampleRate
    this.timer = setInterval(() => this.tick(), LEVEL_INTERVAL_MS)
  }

  push(id: string, bytes: Uint8Array): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    let data = bytes
    const left = this.carry.get(id)
    if (left !== undefined) {
      data = new Uint8Array(bytes.length + 1)
      data[0] = left
      data.set(bytes, 1)
      this.carry.delete(id)
    }
    const n = data.length >> 1
    if (data.length % 2) this.carry.set(id, data[data.length - 1]!)
    if (n === 0) return

    const view = new DataView(data.buffer, data.byteOffset, n * 2)
    const ints = new Int16Array(n)
    const floats = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      ints[i] = view.getInt16(i * 2, true)
      floats[i] = ints[i]! / 32768
    }
    const buffer = this.ctx.createBuffer(1, n, this.rate)
    buffer.copyToChannel(floats, 0)
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.connect(this.ctx.destination)
    const start = Math.max(this.nextTime, this.ctx.currentTime + LEAD_S)
    src.start(start)
    this.nextTime = start + n / this.rate

    const w = Math.max(1, Math.round((this.rate * LEVEL_INTERVAL_MS) / 1000))
    const levels: number[] = []
    for (let i = 0; i < n; i += w) levels.push(rmsLevel(ints.subarray(i, i + w)))
    this.segments.push({ start, end: this.nextTime, window: w / this.rate, levels })

    let set = this.live.get(id)
    if (!set) {
      set = new Set()
      this.live.set(id, set)
    }
    set.add(src)
    src.onended = () => {
      const s = this.live.get(id)
      if (!s?.delete(src)) return
      if (s.size > 0) return
      this.live.delete(id)
      if (this.ended.delete(id)) this.emitDone(id)
    }
  }

  /** No more chunks for this utterance; done fires when what's queued has played. */
  end(id: string): void {
    this.carry.delete(id)
    if (this.live.has(id)) this.ended.add(id)
    else this.emitDone(id)
  }

  /** Cuts everything off at once. Stopped utterances never report done. */
  stop(): void {
    for (const set of this.live.values()) {
      for (const s of set) {
        try {
          s.stop()
        } catch {
          // Already stopped.
        }
      }
    }
    this.live.clear()
    this.ended.clear()
    this.carry.clear()
    this.segments = []
    this.nextTime = 0
    this.lastLevel = 0
    for (const cb of this.levelCbs) cb(0)
  }

  onLevel(cb: (l: number) => void): void {
    this.levelCbs.push(cb)
  }

  onDone(cb: (id: string) => void): void {
    this.doneCbs.push(cb)
  }

  dispose(): void {
    clearInterval(this.timer)
    this.stop()
  }

  private tick(): void {
    const t = this.ctx.currentTime
    this.segments = this.segments.filter((s) => s.end > t)
    const seg = this.segments.find((s) => s.start <= t && t < s.end)
    const level = seg ? (seg.levels[Math.min(seg.levels.length - 1, Math.floor((t - seg.start) / seg.window))] ?? 0) : 0
    if (level === 0 && this.lastLevel === 0) return
    this.lastLevel = level
    for (const cb of this.levelCbs) cb(level)
  }

  private emitDone(id: string): void {
    for (const cb of this.doneCbs) cb(id)
  }
}
