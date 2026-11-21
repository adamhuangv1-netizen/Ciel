import { useEffect, useState, type JSX } from 'react'
import { DEFAULT_THEME, type Card, type EmblemState, type EmblemTheme, type OverlayLayout } from '../../shared/types'
import { Emblem } from './Emblem'
import { CardStack } from './CardStack'
import { AvatarView } from './avatar/AvatarView'
import { framingFor } from './avatar/avatarLogic'
import './overlay.css'

export function Overlay(): JSX.Element {
  const [cards, setCards] = useState<Card[]>([])
  const [state, setState] = useState<EmblemState>('idle')
  const [theme, setTheme] = useState<EmblemTheme>(DEFAULT_THEME)
  const [layout, setLayout] = useState<OverlayLayout>('corner')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [level] = useState(0) // driven by the PCM player in Task 5

  useEffect(() => {
    const api = window.ciel
    const offs = [
      api.onTheme(setTheme),
      api.onLayout(setLayout),
      api.onAvatar((url) => {
        setAvatarFailed(false)
        setAvatarUrl(url)
      }),
      api.onEmblem(setState),
      api.onCard((c) => setCards((cs) => [...cs.filter((x) => x.id !== c.id), c])),
      api.onDismiss((id) => setCards((cs) => cs.filter((x) => x.id !== id)))
    ]
    api.ready()
    return () => offs.forEach((off) => off())
  }, [])

  const presence =
    avatarUrl && !avatarFailed ? (
      <AvatarView
        url={avatarUrl}
        state={state}
        level={level}
        framing={framingFor(state, layout)}
        onError={(e) => {
          console.error('avatar failed to load; showing the emblem', e)
          setAvatarFailed(true)
        }}
      />
    ) : (
      <Emblem state={state} level={level} theme={theme} />
    )

  return (
    <div className={`overlay overlay--${layout}`} data-testid="overlay" data-layout={layout}>
      {presence}
      <CardStack
        cards={cards}
        theme={theme}
        onAction={(id, action) => window.ciel.cardAction(id, action)}
        setInteractive={(on) => window.ciel.setInteractive(on)}
      />
    </div>
  )
}
