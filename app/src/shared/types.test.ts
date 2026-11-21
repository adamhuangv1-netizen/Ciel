import { describe, it, expect } from 'vitest'
import { cardTag, type CardKind } from './types'

describe('cardTag', () => {
  it.each<[CardKind, string]>([
    ['notice', 'NOTICE'],
    ['answer', 'ANSWER'],
    ['report', 'REPORT'],
    ['request', 'REQUEST']
  ])('%s → %s', (kind, tag) => {
    expect(cardTag(kind)).toBe(tag)
  })
})
