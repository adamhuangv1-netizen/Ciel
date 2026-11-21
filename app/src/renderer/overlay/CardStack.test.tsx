// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CardStack } from './CardStack'
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
      <CardStack cards={[card('c1', 'notice')]} onAction={onAction} setInteractive={setInteractive} />
    )
    fireEvent.pointerEnter(screen.getByTestId('card'))
    rerender(<CardStack cards={[]} onAction={onAction} setInteractive={setInteractive} />)
    expect(setInteractive).toHaveBeenLastCalledWith(false)
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
