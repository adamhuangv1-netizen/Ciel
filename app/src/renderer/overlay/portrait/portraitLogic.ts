import type { Box } from '../../../shared/types'
import type { Framing } from '../avatar/avatarLogic'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** The eyes crop is this much wider than the eyes box itself. */
const EYES_MARGIN = 1.3

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/**
 * Which part of the picture to show, in picture pixels: all of it when she's fully shown, or a crop
 * around her eyes at the view's shape (width / height) for the small idle pill.
 */
export function sourceRect(framing: Framing, eyes: Box, img: { w: number; h: number }, viewAspect: number): Rect {
  if (framing === 'full') return { x: 0, y: 0, w: img.w, h: img.h }
  let w = Math.min(img.w, eyes.w * img.w * EYES_MARGIN)
  let h = w / viewAspect
  if (h > img.h) {
    h = img.h
    w = h * viewAspect
  }
  const cx = (eyes.x + eyes.w / 2) * img.w
  const cy = (eyes.y + eyes.h / 2) * img.h
  return { x: clamp(cx - w / 2, 0, img.w - w), y: clamp(cy - h / 2, 0, img.h - h), w, h }
}

/** Where a picture of size `src` lands inside `view`, scaled to fit without stretching and centred. */
export function containRect(src: { w: number; h: number }, view: { w: number; h: number }): Rect {
  const s = Math.min(view.w / src.w, view.h / src.h)
  const w = src.w * s
  const h = src.h * s
  return { x: (view.w - w) / 2, y: (view.h - h) / 2, w, h }
}

const FIRST_MIN_S = 2.5
const FIRST_SPREAD_S = 5
const LENGTH_MIN_S = 0.08
const LENGTH_SPREAD_S = 0.2
const GAP_MIN_S = 3
const GAP_SPREAD_S = 7

/**
 * "Sometimes a little" glitch: a brief burst (0.08–0.28 s) every 3–10 s. Call with non-decreasing
 * times in seconds; `seed` changes per burst so each one looks different.
 */
export function createGlitcher(rng: () => number = Math.random): (t: number) => { strength: number; seed: number } {
  let start = FIRST_MIN_S + rng() * FIRST_SPREAD_S
  let end = start + LENGTH_MIN_S + rng() * LENGTH_SPREAD_S
  let strength = 0.4 + rng() * 0.6
  let seed = rng()
  return (t) => {
    while (t >= end) {
      start = end + GAP_MIN_S + rng() * GAP_SPREAD_S
      end = start + LENGTH_MIN_S + rng() * LENGTH_SPREAD_S
      strength = 0.4 + rng() * 0.6
      seed = rng()
    }
    return { strength: t >= start ? strength : 0, seed }
  }
}
