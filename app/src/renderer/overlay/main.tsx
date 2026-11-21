import { StrictMode, useEffect, useState, type JSX } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_THEME, type Card, type EmblemState, type EmblemTheme } from '../../shared/types'
import { Emblem } from './Emblem'
import { CardStack } from './CardStack'
import './overlay.css'

function Overlay(): JSX.Element {
  const [cards, setCards] = useState<Card[]>([])
  const [state, setState] = useState<EmblemState>('idle')
  const [theme, setTheme] = useState<EmblemTheme>(DEFAULT_THEME)
  const [level] = useState(0) // driven by the PCM player in Task 5

  useEffect(() => {
    const offs = [
      window.ciel.onTheme(setTheme),
      window.ciel.onEmblem(setState),
      window.ciel.onCard((c) => setCards((cs) => [...cs.filter((x) => x.id !== c.id), c])),
      window.ciel.onDismiss((id) => setCards((cs) => cs.filter((x) => x.id !== id)))
    ]
    window.ciel.ready()
    return () => offs.forEach((off) => off())
  }, [])

  return (
    <div className="overlay">
      <Emblem state={state} level={level} theme={theme} />
      <CardStack cards={cards} theme={theme} onAction={window.ciel.cardAction} setInteractive={window.ciel.setInteractive} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>
)
