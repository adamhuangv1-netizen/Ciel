import { useEffect, useRef, type CSSProperties, type JSX } from 'react'
import {
  cardTag,
  DEFAULT_THEME,
  type Card,
  type CardAction,
  type EmblemTheme,
  type OverlayLayout
} from '../../shared/types'
import { useTypewriter } from './useTypewriter'
import './CardStack.css'

export const MAX_VISIBLE_CARDS = 3

/**
 * How many cards fit above the presence on a screen this tall (CSS px of the overlay window).
 * A long REQUEST card is about 250 px; the portrait takes up to 375 px (corner) or 60 % (stage).
 */
export function visibleCardCount(height: number, layout: OverlayLayout): number {
  if (layout === 'stage') return height >= 1300 ? 2 : 1
  if (height >= 1100) return 3
  return height >= 800 ? 2 : 1
}

/** The cards to show: waiting requests first (they need a click), then the newest others; displayed newest first. */
export function pickVisible(cards: Card[], max: number): Card[] {
  const newestFirst = [...cards].sort((a, b) => b.createdAt - a.createdAt)
  const chosen = [
    ...newestFirst.filter((c) => c.kind === 'request'),
    ...newestFirst.filter((c) => c.kind !== 'request')
  ].slice(0, max)
  return newestFirst.filter((c) => chosen.includes(c))
}

const REQUEST_ACTIONS: CardAction[] = [
  { id: 'approve', label: 'Approve' },
  { id: 'deny', label: 'Deny' },
  { id: 'always', label: 'Always allow' }
]

export interface CardStackProps {
  cards: Card[]
  onAction(cardId: string, actionId: CardAction['id']): void
  setInteractive(on: boolean): void
  theme?: EmblemTheme
  /** How many cards to show before "+N more" (see visibleCardCount). */
  maxVisible?: number
}

export function CardStack({
  cards,
  onAction,
  setInteractive,
  theme = DEFAULT_THEME,
  maxVisible = MAX_VISIBLE_CARDS
}: CardStackProps): JSX.Element {
  const visible = pickVisible(cards, maxVisible)
  const hidden = cards.length - visible.length
  const style = { '--ring': theme.ring, '--alert': theme.alert } as CSSProperties

  return (
    <div className="card-stack" style={style}>
      {visible.map((c) => (
        <CardView key={c.id} card={c} onAction={onAction} setInteractive={setInteractive} />
      ))}
      {hidden > 0 && <div className="card-stack__more">+{hidden} more</div>}
    </div>
  )
}

function CardView({
  card,
  onAction,
  setInteractive
}: {
  card: Card
  onAction: CardStackProps['onAction']
  setInteractive: CardStackProps['setInteractive']
}): JSX.Element {
  const text = useTypewriter(card.body, 18)
  const hovered = useRef(false)
  const actions = card.actions ?? (card.kind === 'request' ? REQUEST_ACTIONS : [])
  // The parent passes a fresh callback on every render; keep the latest without re-running the
  // unmount cleanup below (which would release the overlay while the pointer is still on the card).
  const setInteractiveRef = useRef(setInteractive)
  setInteractiveRef.current = setInteractive

  // A card removed while the pointer is on it never gets pointerleave; release the overlay anyway,
  // or the transparent window would keep swallowing clicks meant for the desktop.
  useEffect(
    () => () => {
      if (hovered.current) setInteractiveRef.current(false)
    },
    []
  )

  return (
    <section
      className={`card card--${card.kind}`}
      data-testid="card"
      data-card-id={card.id}
      aria-label={`${cardTag(card.kind)}: ${card.body}`}
      onPointerEnter={() => {
        hovered.current = true
        setInteractive(true)
      }}
      onPointerLeave={() => {
        hovered.current = false
        setInteractive(false)
      }}
    >
      <header className="card__tag">{cardTag(card.kind)}</header>
      <p className="card__body">{text}</p>
      {actions.length > 0 && (
        <div className="card__actions">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`card__btn card__btn--${a.id}`}
              onClick={() => onAction(card.id, a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
