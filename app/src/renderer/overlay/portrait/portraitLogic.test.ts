import { describe, it, expect } from 'vitest'
import { sourceRect, containRect, createGlitcher } from './portraitLogic'

const IMG = { w: 1000, h: 1250 }
const PILL = 240 / 92

describe('sourceRect', () => {
  it('shows the whole picture when she is fully shown', () => {
    expect(sourceRect('full', { x: 0.35, y: 0.25, w: 0.3, h: 0.1 }, IMG, PILL)).toEqual({ x: 0, y: 0, w: 1000, h: 1250 })
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
    expect(containRect({ w: 1000, h: 1250 }, { w: 300, h: 360 })).toEqual({ x: 6, y: 0, w: 288, h: 360 })
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
