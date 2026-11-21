import { describe, it, expect } from 'vitest'
import { createOverlayState } from './overlayState'
import { IPC, type Card } from '../../shared/types'

const card = (id: string, createdAt: number, kind: Card['kind'] = 'notice'): Card => ({
  id,
  kind,
  body: id,
  createdAt
})

describe('createOverlayState', () => {
  it('replays the emblem state and active cards, oldest first', () => {
    const s = createOverlayState()
    s.addCard(card('b', 2))
    s.addCard(card('a', 1, 'request'))
    s.setEmblem('alert')
    expect(s.replay()).toEqual([
      [IPC.setEmblem, 'alert'],
      [IPC.showCard, card('a', 1, 'request')],
      [IPC.showCard, card('b', 2)]
    ])
  })

  it('forgets dismissed cards', () => {
    const s = createOverlayState()
    s.addCard(card('a', 1))
    s.addCard(card('b', 2))
    s.removeCard('a')
    expect(s.replay()).toEqual([
      [IPC.setEmblem, 'idle'],
      [IPC.showCard, card('b', 2)]
    ])
    expect(s.kindOf('a')).toBeUndefined()
    expect(s.kindOf('b')).toBe('notice')
  })
})
