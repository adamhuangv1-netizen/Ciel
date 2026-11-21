import { describe, it, expect } from 'vitest'
import { framingFor, expressionWeights, createBlinker, gazeOffset, cameraFor } from './avatarLogic'

describe('framingFor', () => {
  it('shrinks to just the eyes when idle in the corner', () => {
    expect(framingFor('idle', 'corner')).toBe('eyes')
  })

  it('shows the full bust whenever she is doing something in the corner', () => {
    for (const s of ['listening', 'thinking', 'speaking', 'alert'] as const) {
      expect(framingFor(s, 'corner')).toBe('full')
    }
  })

  it('always shows the full bust on a stage monitor', () => {
    expect(framingFor('idle', 'stage')).toBe('full')
  })
})

describe('expressionWeights', () => {
  it('opens the mouth with the speech level while speaking', () => {
    expect(expressionWeights('speaking', 0.7, 0)).toMatchObject({ aa: 0.7, happy: 0.1, blink: 0 })
  })

  it('keeps the mouth closed in every other state', () => {
    for (const s of ['idle', 'listening', 'thinking', 'alert'] as const) {
      expect(expressionWeights(s, 0.9, 0).aa).toBe(0)
    }
  })

  it('looks attentive when listening and concerned on an alert', () => {
    expect(expressionWeights('listening', 0, 0).surprised).toBe(0.15)
    expect(expressionWeights('alert', 0, 0).surprised).toBe(0.3)
  })

  it('passes the blink weight through and clamps the level', () => {
    expect(expressionWeights('idle', 0, 0.6).blink).toBe(0.6)
    expect(expressionWeights('speaking', 4, 0).aa).toBe(1)
  })
})

describe('createBlinker', () => {
  it('blinks after the interval the random source picks, closing fully mid-blink', () => {
    const b = createBlinker(() => 0) // shortest interval: 2.5 s
    expect(b.weightAt(1.0)).toBe(0)
    expect(b.weightAt(2.5 + 0.075)).toBeCloseTo(1, 5)
    expect(b.weightAt(2.5 + 0.15 + 0.01)).toBe(0)
  })

  it('waits at most 6 s between blinks', () => {
    const b = createBlinker(() => 0.999999)
    expect(b.weightAt(5.9)).toBe(0)
    expect(b.weightAt(6.0 + 0.075)).toBeGreaterThan(0.9)
  })

  it('schedules the next blink after one ends', () => {
    const b = createBlinker(() => 0)
    b.weightAt(2.6) // during the first blink
    expect(b.weightAt(2.5 + 0.15 + 2.5 + 0.075)).toBeCloseTo(1, 5)
  })
})

describe('gazeOffset', () => {
  it('glances up and aside while thinking', () => {
    expect(gazeOffset('thinking')).toEqual({ x: 0.6, y: 0.5 })
  })

  it('looks straight at the viewer otherwise', () => {
    expect(gazeOffset('speaking')).toEqual({ x: 0, y: 0 })
  })
})

describe('cameraFor', () => {
  const head = { x: 0, y: 1.4, z: 0 }

  it('frames head and shoulders for the full bust, with room above the hair', () => {
    expect(cameraFor('full', head)).toEqual({
      position: { x: 0, y: 1.37, z: 1.1 },
      target: { x: 0, y: 1.35, z: 0 },
      fov: 30
    })
  })

  it('frames a tight close-up on the eyes', () => {
    expect(cameraFor('eyes', head)).toEqual({
      position: { x: 0, y: 1.46, z: 0.42 },
      target: { x: 0, y: 1.46, z: 0 },
      fov: 18
    })
  })
})
