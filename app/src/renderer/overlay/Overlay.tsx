import { useEffect, useState, type JSX } from 'react'
import {
  DEFAULT_THEME,
  type AvatarSource,
  type Card,
  type EmblemState,
  type EmblemTheme,
  type OverlayLayout
} from '../../shared/types'
import { Emblem } from './Emblem'
import { CardStack } from './CardStack'
import { AvatarView } from './avatar/AvatarView'
import { PortraitView } from './portrait/PortraitView'
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
  const [avatar, setAvatar] = useState<AvatarSource | null>(null)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [level, setLevel] = useState(0)

  useEffect(() => {
    const api = window.ciel
    const offs = [
      api.onTheme(setTheme),
      api.onLayout(setLayout),
      api.onAvatar((src) => {
        setAvatarFailed(false)
        setAvatar(src)
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

  const fallBack = (e: unknown): void => {
    console.error('avatar failed to load; showing the emblem', e)
    setAvatarFailed(true)
  }
  const framing = framingFor(state, layout)
  const presence =
    avatar && !avatarFailed ? (
      avatar.kind === 'portrait' ? (
        <PortraitView
          url={avatar.url}
          eyes={avatar.eyes}
          state={state}
          level={level}
          framing={framing}
          theme={theme}
          onError={fallBack}
        />
      ) : (
        <AvatarView url={avatar.url} state={state} level={level} framing={framing} onError={fallBack} />
      )
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
