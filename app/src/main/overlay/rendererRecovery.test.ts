import { describe, it, expect } from 'vitest'
import { createReloadPolicy } from './rendererRecovery'

describe('createReloadPolicy', () => {
  it('reloads a crashed overlay up to 3 times a minute', () => {
    const allow = createReloadPolicy()
    expect([allow(0), allow(1_000), allow(2_000), allow(3_000)]).toEqual([true, true, true, false])
  })

  it('allows reloads again once the minute has passed', () => {
    const allow = createReloadPolicy()
    allow(0)
    allow(1_000)
    allow(2_000)
    expect(allow(30_000)).toBe(false)
    expect(allow(61_000)).toBe(true)
  })
})
