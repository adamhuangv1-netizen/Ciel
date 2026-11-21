import type { EmblemState, OverlayLayout } from '../../../shared/types'

export type Framing = 'full' | 'eyes'

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** In the corner she shrinks to just her eyes while idle; on a stage monitor she's always fully shown. */
export function framingFor(state: EmblemState, layout: OverlayLayout): Framing {
  if (layout === 'stage') return 'full'
  return state === 'idle' ? 'eyes' : 'full'
}

export type ExpressionName = 'aa' | 'happy' | 'surprised' | 'relaxed' | 'blink'

const clamp01 = (n: number): number => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0))

/** VRM preset expression weights for a state. `level` is speech loudness, `blink` the blinker's weight. */
export function expressionWeights(state: EmblemState, level: number, blink: number): Record<ExpressionName, number> {
  const w: Record<ExpressionName, number> = { aa: 0, happy: 0, surprised: 0, relaxed: 0, blink: clamp01(blink) }
  switch (state) {
    case 'idle':
      w.relaxed = 0.2
      break
    case 'listening':
      w.surprised = 0.15
      break
    case 'thinking':
      w.relaxed = 0.1
      break
    case 'speaking':
      w.aa = clamp01(level)
      w.happy = 0.1
      break
    case 'alert':
      w.surprised = 0.3
      break
  }
  return w
}

const BLINK_MIN_S = 2.5
const BLINK_SPREAD_S = 3.5
const BLINK_LENGTH_S = 0.15

/**
 * Natural blinking: a 150 ms close-open every 2.5–6 s. `weightAt` must be called with
 * non-decreasing times (seconds); `rng` returns values in [0, 1).
 */
export function createBlinker(rng: () => number = Math.random): { weightAt(t: number): number } {
  let start = BLINK_MIN_S + rng() * BLINK_SPREAD_S
  return {
    weightAt(t: number): number {
      while (t > start + BLINK_LENGTH_S) start = start + BLINK_LENGTH_S + BLINK_MIN_S + rng() * BLINK_SPREAD_S
      if (t < start) return 0
      const half = BLINK_LENGTH_S / 2
      return Math.max(0, 1 - Math.abs(t - (start + half)) / half)
    }
  }
}

/** Where she looks, relative to the camera: thinking glances up and aside. */
export function gazeOffset(state: EmblemState): { x: number; y: number } {
  return state === 'thinking' ? { x: 0.6, y: 0.5 } : { x: 0, y: 0 }
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000

/** Camera placement relative to the head bone's world position (VRM faces +Z after normalising). */
export function cameraFor(framing: Framing, head: Vec3): { position: Vec3; target: Vec3; fov: number } {
  if (framing === 'eyes') {
    const y = r3(head.y + 0.06)
    return { position: { x: head.x, y, z: r3(head.z + 0.42) }, target: { x: head.x, y, z: head.z }, fov: 18 }
  }
  return {
    position: { x: head.x, y: r3(head.y - 0.03), z: r3(head.z + 1.1) },
    target: { x: head.x, y: r3(head.y - 0.05), z: head.z },
    fov: 30
  }
}
