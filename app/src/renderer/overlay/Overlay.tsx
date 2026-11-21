import { useEffect, useState, type JSX } from 'react'
import { DEFAULT_THEME, type Card, type EmblemState, type EmblemTheme, type OverlayLayout } from '../../shared/types'
import { Emblem } from './Emblem'
import { CardStack } from './CardStack'
import './overlay.css'

export function Overlay(): JSX.Element {
  const [cards, setCards] = useState<Card[]>([])
  const [state, setState] = useState<EmblemState>('idle')
  const [theme, setTheme] = useState<EmblemTheme>(DEFAULT_THEME)
  const [layout, setLayout] = useState<OverlayLayout>('corner')
  const [level] = useState(0) // driven by the PCM player in Task 5

  useEffect(() => {
    const api = window.ciel
    const offs = [
      api.onTheme(setTheme),
      api.onLayout(setLayout),
      api.onEmblem(setState),
      api.onCard((c) => setCards((cs) => [...cs.filter((x) => x.id !== c.id), c])),
      api.onDismiss((id) => setCards((cs) => cs.filter((x) => x.id !== id)))
    ]
    api.ready()
    return () => offs.forEach((off) => off())
  }, [])

  return (
    <div className={`overlay overlay--${layout}`} data-testid="overlay" data-layout={layout}>
      <Emblem state={state} level={level} theme={theme} />
      <CardStack
        cards={cards}
        theme={theme}
        onAction={(id, action) => window.ciel.cardAction(id, action)}
        setInteractive={(on) => window.ciel.setInteractive(on)}
      />
    </div>
  )
}
