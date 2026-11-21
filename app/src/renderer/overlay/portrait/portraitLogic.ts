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
export function sourceRect(
  framing: Framing,
  eyes: Box,
  img: { w: number; h: number },
  viewAspect: number
): Rect {
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
export function createGlitcher(
  rng: () => number = Math.random
): (t: number) => { strength: number; seed: number } {
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

/** A fractional box (0–1) in picture pixels. */
export function boxRect(b: Box, img: { w: number; h: number }): Rect {
  return { x: b.x * img.w, y: b.y * img.h, w: b.w * img.w, h: b.h * img.h }
}

/** Where a rectangle of the picture lands on screen, given the part of the picture drawn (src) and where (dest). */
export function mapRect(r: Rect, src: Rect, dest: Rect): Rect {
  const sx = dest.w / src.w
  const sy = dest.h / src.h
  return {
    x: dest.x + (r.x - src.x) * sx,
    y: dest.y + (r.y - src.y) * sy,
    w: r.w * sx,
    h: r.h * sy
  }
}

/**
 * The upper eyelid during a blink, in the eye box's space: it starts just above the eye and comes
 * down to the bottom of the box when fully closed. Null while the eye is open.
 */
export function lidRect(eye: Rect, weight: number): Rect | null {
  if (weight <= 0.01) return null
  const top = eye.y - 0.15 * eye.h
  return { x: eye.x, y: top, w: eye.w, h: 0.15 * eye.h + Math.min(1, weight) * eye.h }
}

/** The open mouth while she speaks: an ellipse centred in the mouth box, taller and a little wider with loudness. */
export function mouthShape(
  mouth: Rect,
  open: number
): { cx: number; cy: number; rx: number; ry: number } | null {
  if (open <= 0.05) return null
  const o = Math.min(1, open)
  return {
    cx: mouth.x + mouth.w / 2,
    cy: mouth.y + mouth.h / 2,
    rx: mouth.w * (0.22 + 0.1 * o),
    ry: (mouth.h / 2) * o
  }
}

/** Mean colour of the opaque pixels of `data` (RGBA, `width` pixels per row) inside `r`. */
export function averageColor(
  data: Uint8ClampedArray,
  width: number,
  r: Rect
): { r: number; g: number; b: number } {
  let n = 0
  let sr = 0
  let sg = 0
  let sb = 0
  for (let y = Math.floor(r.y); y < Math.floor(r.y + r.h); y++) {
    for (let x = Math.floor(r.x); x < Math.floor(r.x + r.w); x++) {
      const i = (y * width + x) * 4
      if ((data[i + 3] ?? 0) < 200) continue
      sr += data[i]!
      sg += data[i + 1]!
      sb += data[i + 2]!
      n++
    }
  }
  return n
    ? { r: Math.round(sr / n), g: Math.round(sg / n), b: Math.round(sb / n) }
    : { r: 0, g: 0, b: 0 }
}
