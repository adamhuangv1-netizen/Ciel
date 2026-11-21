import { useEffect, useRef, type JSX } from 'react'
import type { EmblemState } from '../../../shared/types'
import { createAvatarScene, type AvatarScene } from './avatarScene'
import type { Framing } from './avatarLogic'
import './AvatarView.css'

export interface AvatarViewProps {
  url: string
  state: EmblemState
  level: number
  framing: Framing
  /** Called if the model can't be loaded, so the overlay can fall back to the emblem. */
  onError(err: unknown): void
}

export function AvatarView({ url, state, level, framing, onError }: AvatarViewProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<AvatarScene | null>(null)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    if (!canvasRef.current) return
    const s = createAvatarScene(canvasRef.current, url)
    sceneRef.current = s
    s.ready.catch((e: unknown) => onErrorRef.current(e))
    return () => {
      s.dispose()
      sceneRef.current = null
    }
  }, [url])

  useEffect(() => sceneRef.current?.setState(state), [state])
  useEffect(() => sceneRef.current?.setLevel(level), [level])
  useEffect(() => sceneRef.current?.setFraming(framing), [framing])

  return (
    <div className={`avatar avatar--${framing}`} data-testid="avatar" data-framing={framing} role="img" aria-label={`Ciel is ${state}`}>
      <canvas ref={canvasRef} className="avatar__canvas" />
    </div>
  )
}
