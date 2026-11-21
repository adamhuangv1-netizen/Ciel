import { useEffect, useState, type JSX } from 'react'
import { DEFAULT_THEME, type Card, type EmblemState, type EmblemTheme, type OverlayLayout } from '../../shared/types'
import { Emblem } from './Emblem'
import { CardStack } from './CardStack'
import { AvatarView } from './avatar/AvatarView'
import { framingFor } from './avatar/avatarLogic'
import { PcmPlayer } from './pcmPlayer'
import './overlay.css'

/** Speech RMS rarely passes ~0.3 of full scale; scale it so the mouth and glow use their full range. */
const LEVEL_GAIN = 3.5

export function Overlay(): JSX.Element {
  const [cards, setCards] = useState<Card[]>([])
  const [state, setState] = useState<EmblemState>('idle')
  const [theme, setTheme] = useState<EmblemTheme>(DEFAULT_THEME)
  const [layout, setLayout] = useState<OverlayLayout>('corner')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [level, setLevel] = useState(0)

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

    // Speech: created on the first chunk, so no AudioContext exists until she first speaks.
    let ctx: AudioContext | null = null
    let player: PcmPlayer | null = null
    const playerFor = (sampleRate: number): PcmPlayer => {
      if (!player) {
        ctx = new AudioContext()
        player = new PcmPlayer(ctx, sampleRate)
        player.onLevel((l) => setLevel(Math.min(1, l * LEVEL_GAIN)))
        player.onDone((id) => api.audioDone(id))
      }
      return player
    }
    offs.push(
      api.onAudioChunk((c) => playerFor(c.sampleRate).push(c.utteranceId, c.bytes)),
      api.onAudioEnd((id) => (player ? player.end(id) : api.audioDone(id))),
      api.onAudioStop(() => player?.stop())
    )

    api.ready()
    return () => {
      offs.forEach((off) => off())
      player?.dispose()
      void ctx?.close()
    }
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
