// @vitest-environment jsdom
import type { JSX } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CardStack, visibleCardCount, pickVisible } from './CardStack'
import type { Card, CardKind } from '../../shared/types'

afterEach(cleanup)

const card = (id: string, kind: CardKind, createdAt = 1): Card => ({
  id,
  kind,
  body: `Body of ${id}`,
  createdAt
})

function renderStack(cards: Card[]) {
  const onAction = vi.fn()
  const setInteractive = vi.fn()
  render(<CardStack cards={cards} onAction={onAction} setInteractive={setInteractive} />)
  return { onAction, setInteractive }
}

describe('CardStack', () => {
  it.each<[CardKind, string]>([
    ['notice', 'NOTICE'],
    ['answer', 'ANSWER'],
    ['report', 'REPORT'],
    ['request', 'REQUEST']
  ])('labels a %s card %s', (kind, tag) => {
    renderStack([card('c1', kind)])
    expect(screen.getByText(tag)).toBeTruthy()
  })

  it('gives a request card Approve, Deny and Always allow buttons', () => {
    renderStack([card('r1', 'request')])
    for (const label of ['Approve', 'Deny', 'Always allow']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('reports Approve clicks with the card id', () => {
    const { onAction } = renderStack([card('r1', 'request')])
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(onAction).toHaveBeenCalledWith('r1', 'approve')
  })

  it('shows the 3 newest of 10 cards and a +7 more marker', () => {
    const cards = Array.from({ length: 10 }, (_, i) => card(`c${i}`, 'notice', i))
    renderStack(cards)
    const shown = screen.getAllByTestId('card').map((el) => el.getAttribute('data-card-id'))
    expect(shown).toEqual(['c9', 'c8', 'c7'])
    expect(screen.getByText('+7 more')).toBeTruthy()
  })

  it('releases the overlay when a hovered card is removed (no pointerleave)', () => {
    const onAction = vi.fn()
    const setInteractive = vi.fn()
    const { rerender } = render(
      <CardStack
        cards={[card('c1', 'notice')]}
        onAction={onAction}
        setInteractive={setInteractive}
      />
    )
    fireEvent.pointerEnter(screen.getByTestId('card'))
    rerender(<CardStack cards={[]} onAction={onAction} setInteractive={setInteractive} />)
    expect(setInteractive).toHaveBeenLastCalledWith(false)
  })

  it('keeps the overlay interactive when it re-renders with a new callback while a card is hovered', () => {
    const calls: boolean[] = []
    const stack = (): JSX.Element => (
      <CardStack
        cards={[card('c1', 'notice')]}
        onAction={() => {}}
        setInteractive={(on) => calls.push(on)}
      />
    )
    const { rerender } = render(stack())
    fireEvent.pointerEnter(screen.getByTestId('card'))
    rerender(stack()) // e.g. a voice-level update re-renders the overlay with fresh arrow functions
    expect(calls).toEqual([true])
  })

  it('shows only as many cards as maxVisible allows', () => {
    const cards = Array.from({ length: 4 }, (_, i) => card(`c${i}`, 'notice', i))
    render(<CardStack cards={cards} maxVisible={1} onAction={() => {}} setInteractive={() => {}} />)
    expect(screen.getAllByTestId('card').map((el) => el.getAttribute('data-card-id'))).toEqual([
      'c3'
    ])
    expect(screen.getByText('+3 more')).toBeTruthy()
  })

  it('never hides a waiting request behind newer notices', () => {
    const cards = [
      card('r1', 'request', 1),
      ...Array.from({ length: 5 }, (_, i) => card(`n${i}`, 'notice', 10 + i))
    ]
    render(<CardStack cards={cards} maxVisible={2} onAction={() => {}} setInteractive={() => {}} />)
    const shown = screen.getAllByTestId('card').map((el) => el.getAttribute('data-card-id'))
    expect(shown).toContain('r1')
    expect(shown).toHaveLength(2)
  })

  it('makes the overlay interactive only while the pointer is over a card', () => {
    const { setInteractive } = renderStack([card('c1', 'notice')])
    const el = screen.getByTestId('card')
    fireEvent.pointerEnter(el)
    expect(setInteractive).toHaveBeenLastCalledWith(true)
    fireEvent.pointerLeave(el)
    expect(setInteractive).toHaveBeenLastCalledWith(false)
  })
})

describe('visibleCardCount', () => {
  it('shows 3 cards in the corner on a tall screen, fewer as it gets shorter', () => {
    expect(visibleCardCount(1392, 'corner')).toBe(3) // 1440p at 100 %
    expect(visibleCardCount(1040, 'corner')).toBe(2) // 1080p at 100 %
    expect(visibleCardCount(688, 'corner')).toBe(1) // 1080p at 150 %
  })

  it('leaves room for the large stage presence', () => {
    expect(visibleCardCount(1080, 'stage')).toBe(1)
    expect(visibleCardCount(1440, 'stage')).toBe(2)
  })
})

describe('pickVisible', () => {
  it('keeps requests first, then the newest others, shown newest first', () => {
    const cards = [
      card('n1', 'notice', 5),
      card('r1', 'request', 1),
      card('n2', 'notice', 9),
      card('n3', 'notice', 7)
    ]
    expect(pickVisible(cards, 2).map((c) => c.id)).toEqual(['n2', 'r1'])
  })
})
