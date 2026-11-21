import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Card, CardKind } from '../../shared/types'
import { createDismissTimers, dismissDelayMs, SPEECH_SAFETY_MS } from './dismissTimers'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const card = (id: string, kind: CardKind = 'notice', body = 'Short.'): Card => ({
  id,
  kind,
  body,
  createdAt: 0
})

function setup(): { dismissed: string[]; timers: ReturnType<typeof createDismissTimers> } {
  const dismissed: string[] = []
  return { dismissed, timers: createDismissTimers((id) => dismissed.push(id)) }
}

describe('dismissDelayMs', () => {
  it('is 12 s plus the time the card takes to type out, capped', () => {
    expect(dismissDelayMs('')).toBe(12_000)
    expect(dismissDelayMs('x'.repeat(100))).toBe(12_000 + 1_800)
    expect(dismissDelayMs('x'.repeat(5_000))).toBe(60_000)
  })
})

describe('createDismissTimers', () => {
  it('dismisses a short card about 12 s after it appears when nothing is spoken', () => {
    const { dismissed, timers } = setup()
    timers.shown(card('a'), { waitForSpeech: false })
    vi.advanceTimersByTime(11_900)
    expect(dismissed).toEqual([])
    vi.advanceTimersByTime(300)
    expect(dismissed).toEqual(['a'])
  })

  it('gives a long answer time to type out before it goes', () => {
    const { dismissed, timers } = setup()
    timers.shown(card('long', 'answer', 'x'.repeat(2_000)), { waitForSpeech: false })
    vi.advanceTimersByTime(40_000)
    expect(dismissed).toEqual([])
    vi.advanceTimersByTime(9_000)
    expect(dismissed).toEqual(['long'])
  })

  it('starts counting only when its speech ends', () => {
    const { dismissed, timers } = setup()
    timers.shown(card('a'), { waitForSpeech: true })
    vi.advanceTimersByTime(30_000)
    expect(dismissed).toEqual([])
    timers.speechDone('a')
    vi.advanceTimersByTime(11_900)
    expect(dismissed).toEqual([])
    vi.advanceTimersByTime(300)
    expect(dismissed).toEqual(['a'])
  })

  it('still dismisses if its speech never reports back', () => {
    const { dismissed, timers } = setup()
    timers.shown(card('a'), { waitForSpeech: true })
    vi.advanceTimersByTime(SPEECH_SAFETY_MS + 100)
    expect(dismissed).toEqual(['a'])
  })

  it('never dismisses a request', () => {
    const { dismissed, timers } = setup()
    timers.shown(card('r', 'request'), { waitForSpeech: false })
    timers.speechDone('r')
    vi.advanceTimersByTime(10 * 60_000)
    expect(dismissed).toEqual([])
  })

  it('holds cards while the pointer is over them, then lets them go', () => {
    const { dismissed, timers } = setup()
    timers.shown(card('a'), { waitForSpeech: false })
    vi.advanceTimersByTime(5_000)
    timers.setHovering(true)
    vi.advanceTimersByTime(20_000)
    expect(dismissed).toEqual([])
    timers.setHovering(false)
    vi.advanceTimersByTime(3_100)
    expect(dismissed).toEqual(['a'])
  })

  it('forgets a card that was removed some other way', () => {
    const { dismissed, timers } = setup()
    timers.shown(card('a'), { waitForSpeech: false })
    timers.removed('a')
    vi.advanceTimersByTime(60_000)
    expect(dismissed).toEqual([])
  })
})
