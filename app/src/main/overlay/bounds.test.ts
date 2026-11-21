import { describe, it, expect } from 'vitest'
import { overlayBounds } from './bounds'

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
