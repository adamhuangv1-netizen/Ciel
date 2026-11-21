import { useEffect, useRef, type CSSProperties, type JSX } from 'react'
import { cardTag, DEFAULT_THEME, type Card, type CardAction, type EmblemTheme } from '../../shared/types'
import { useTypewriter } from './useTypewriter'
import './CardStack.css'

export const MAX_VISIBLE_CARDS = 3

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
}

export function CardStack({ cards, onAction, setInteractive, theme = DEFAULT_THEME }: CardStackProps): JSX.Element {
  const newestFirst = [...cards].sort((a, b) => b.createdAt - a.createdAt)
  const visible = newestFirst.slice(0, MAX_VISIBLE_CARDS)
  const hidden = newestFirst.length - visible.length
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

  // A card removed while the pointer is on it never gets pointerleave; release the overlay anyway,
  // or the transparent window would keep swallowing clicks meant for the desktop.
  useEffect(
    () => () => {
      if (hovered.current) setInteractive(false)
    },
    [setInteractive]
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
            <button key={a.id} type="button" className={`card__btn card__btn--${a.id}`} onClick={() => onAction(card.id, a.id)}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
