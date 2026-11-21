import { describe, it, expect } from 'vitest'
import { overlayBounds, pickDisplay, displayLabel } from './bounds'

const main = { id: 7, size: { width: 2560, height: 1440 } }
const side = { id: 2, size: { width: 1920, height: 1080 } }
const small = { id: 1, size: { width: 1280, height: 800 } }

describe('pickDisplay', () => {
  it('uses the preferred monitor when it is connected', () => {
    expect(pickDisplay([main, side, small], 1, main)).toBe(small)
  })

  it('falls back to the primary when the preferred monitor is unplugged', () => {
    expect(pickDisplay([main, side], 1, main)).toBe(main)
  })

  it('uses the primary when there is no preference', () => {
    expect(pickDisplay([main, side, small], null, main)).toBe(main)
  })
})

describe('displayLabel', () => {
  it('names a monitor by position and resolution, marking the main one', () => {
    expect(displayLabel(main, 0, 7)).toBe('Display 1 · 2560×1440 (main)')
    expect(displayLabel(side, 1, 7)).toBe('Display 2 · 1920×1080')
  })
})

describe('overlayBounds', () => {
  it('covers a standard work area (taskbar at the bottom)', () => {
    expect(overlayBounds({ x: 0, y: 0, width: 1920, height: 1040 })).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1040
    })
  })

  it('keeps the offset when the taskbar is docked left', () => {
    expect(overlayBounds({ x: 48, y: 0, width: 1872, height: 1080 })).toEqual({
      x: 48,
      y: 0,
      width: 1872,
      height: 1080
    })
  })

  it('passes a scaled (DIP) work area through unchanged', () => {
    // 2560x1440 at 150 % scaling is a 1706.67 x 960 DIP work area; Electron reports DIPs.
    const dip = { x: 0, y: 0, width: 1707, height: 912 }
    expect(overlayBounds(dip)).toEqual(dip)
  })
})
