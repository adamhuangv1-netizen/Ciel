import { useEffect, useRef, type CSSProperties, type JSX } from 'react'
import type { Box, EmblemState, EmblemTheme } from '../../../shared/types'
import type { Framing } from '../avatar/avatarLogic'
import { createPortraitScene, type PortraitScene } from './portraitScene'
import './PortraitView.css'

export interface PortraitViewProps {
  url: string
  eyes: Box
  state: EmblemState
  level: number
  framing: Framing
  theme: EmblemTheme
  /** Called if the picture can't be loaded, so the overlay can fall back to the emblem. */
  onError(err: unknown): void
}

export function PortraitView({ url, eyes, state, level, framing, theme, onError }: PortraitViewProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<PortraitScene | null>(null)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const framingRef = useRef(framing)
  framingRef.current = framing
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    if (!canvasRef.current) return
    const s = createPortraitScene(canvasRef.current, url, { x: eyes.x, y: eyes.y, w: eyes.w, h: eyes.h }, {
      glow: theme.glow,
      accent: theme.ring
    })
    s.setFraming(framingRef.current)
    s.setState(stateRef.current)
    sceneRef.current = s
    s.ready.catch((e: unknown) => onErrorRef.current(e))
    return () => {
      s.dispose()
      sceneRef.current = null
    }
  }, [url, eyes.x, eyes.y, eyes.w, eyes.h, theme.glow, theme.ring])

  useEffect(() => sceneRef.current?.setState(state), [state])
  useEffect(() => sceneRef.current?.setFraming(framing), [framing])

  const style = {
    '--level': level.toFixed(3),
    '--glow': theme.glow,
    '--ring': theme.ring,
    '--alert': theme.alert
  } as CSSProperties

  return (
    <div
      className={`portrait portrait--${framing} portrait--${state}`}
      style={style}
      data-testid="portrait"
      data-framing={framing}
      role="img"
      aria-label={`Ciel is ${state}`}
    >
      <canvas ref={canvasRef} className="portrait__canvas" />
    </div>
  )
}
