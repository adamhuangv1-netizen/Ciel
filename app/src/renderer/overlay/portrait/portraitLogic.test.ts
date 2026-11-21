import { describe, it, expect } from 'vitest'
import {
  sourceRect,
  containRect,
  createGlitcher,
  boxRect,
  mapRect,
  lidRect,
  mouthShape,
  averageColor
} from './portraitLogic'

const IMG = { w: 1000, h: 1250 }
const PILL = 240 / 92

describe('sourceRect', () => {
  it('shows the whole picture when she is fully shown', () => {
    expect(sourceRect('full', { x: 0.35, y: 0.25, w: 0.3, h: 0.1 }, IMG, PILL)).toEqual({
      x: 0,
      y: 0,
      w: 1000,
      h: 1250
    })
  })

  it('crops to her eyes with some margin, at the view shape', () => {
    const r = sourceRect('eyes', { x: 0.35, y: 0.25, w: 0.3, h: 0.1 }, IMG, PILL)
    expect(r.w).toBeCloseTo(390, 6)
    expect(r.h).toBeCloseTo(149.5, 6)
    expect(r.x).toBeCloseTo(305, 6) // centred on the eyes: 500 - 195
    expect(r.y).toBeCloseTo(300.25, 6) // 375 - 74.75
  })

  it('keeps the crop inside the picture', () => {
    const r = sourceRect('eyes', { x: 0.75, y: 0, w: 0.25, h: 0.02 }, IMG, PILL)
    expect(r.y).toBe(0)
    expect(r.x + r.w).toBeLessThanOrEqual(1000)
  })
})

describe('containRect', () => {
  it('fits the picture inside the view without stretching, centred', () => {
    expect(containRect({ w: 1000, h: 1250 }, { w: 300, h: 360 })).toEqual({
      x: 6,
      y: 0,
      w: 288,
      h: 360
    })
  })
})

describe('createGlitcher', () => {
  it('stays calm until the first glitch, which is brief', () => {
    const g = createGlitcher(() => 0) // first at 2.5 s, lasting 0.08 s
    expect(g(2.4).strength).toBe(0)
    expect(g(2.54).strength).toBeGreaterThan(0)
    expect(g(2.59).strength).toBe(0)
  })

  it('waits at least 3 s before the next one', () => {
    const g = createGlitcher(() => 0)
    g(2.54)
    expect(g(5.5).strength).toBe(0)
    expect(g(5.6).strength).toBeGreaterThan(0) // 2.58 + 3
  })

  it('keeps strength within 0..1', () => {
    const g = createGlitcher(() => 0.999)
    for (let t = 0; t < 60; t += 0.01) {
      const s = g(t).strength
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })
})

describe('boxRect', () => {
  it('turns a fractional box into picture pixels', () => {
    expect(boxRect({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, IMG)).toEqual({
      x: 100,
      y: 250,
      w: 300,
      h: 500
    })
  })
})

describe('mapRect', () => {
  it('maps a rectangle from picture pixels to where that part is drawn', () => {
    const src = { x: 100, y: 100, w: 200, h: 100 }
    const dest = { x: 10, y: 20, w: 400, h: 200 }
    expect(mapRect({ x: 150, y: 125, w: 50, h: 25 }, src, dest)).toEqual({
      x: 110,
      y: 70,
      w: 100,
      h: 50
    })
  })
})

describe('lidRect', () => {
  const eye = { x: 100, y: 200, w: 40, h: 20 }

  it('draws no lid while the eye is open', () => {
    expect(lidRect(eye, 0)).toBeNull()
  })

  it('lowers the lid from just above the eye to its bottom as the blink closes', () => {
    expect(lidRect(eye, 1)).toEqual({ x: 100, y: 197, w: 40, h: 23 })
    expect(lidRect(eye, 0.5)).toEqual({ x: 100, y: 197, w: 40, h: 13 })
  })
})

describe('mouthShape', () => {
  const mouth = { x: 200, y: 400, w: 50, h: 20 }

  it('stays closed for near-silence', () => {
    expect(mouthShape(mouth, 0.04)).toBeNull()
  })

  it('opens an ellipse at the mouth, taller as she gets louder', () => {
    expect(mouthShape(mouth, 1)).toEqual({ cx: 225, cy: 410, rx: 16, ry: 10 })
    const half = mouthShape(mouth, 0.5)!
    expect(half.ry).toBeCloseTo(5, 6)
    expect(half.rx).toBeLessThan(16)
  })
})

describe('averageColor', () => {
  it('averages the opaque pixels inside a rectangle', () => {
    // 2x2 RGBA: red, blue, and two transparent pixels that must not count.
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 0, 9, 9, 9, 0])
    expect(averageColor(data, 2, { x: 0, y: 0, w: 2, h: 2 })).toEqual({ r: 128, g: 0, b: 128 })
  })
})
