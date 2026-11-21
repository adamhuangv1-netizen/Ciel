// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import type { CielApi, OverlayLayout } from '../../shared/types'
import { Overlay } from './Overlay'

// WebGL isn't available in jsdom: stand in for the 3D view with a plain element.
const avatarErrors: ((e: unknown) => void)[] = []
vi.mock('./avatar/AvatarView', () => ({
  AvatarView: (p: { framing: string; onError(e: unknown): void }) => {
    avatarErrors.push(p.onError)
    return <div data-testid="avatar" data-framing={p.framing} />
  }
}))

type Listener = (payload: unknown) => void

function fakeApi(): { api: CielApi; emit: (channel: string, payload: unknown) => void; readyCalls: () => number } {
  const listeners = new Map<string, Listener[]>()
  let ready = 0
  const on =
    (channel: string) =>
    (cb: Listener): (() => void) => {
      listeners.set(channel, [...(listeners.get(channel) ?? []), cb])
      return () => listeners.set(channel, (listeners.get(channel) ?? []).filter((l) => l !== cb))
    }
  const api = {
    onCard: on('card'),
    onDismiss: on('dismiss'),
    onEmblem: on('emblem'),
    onTheme: on('theme'),
    onLayout: on('layout'),
    onAvatar: on('avatar'),
    onAudioChunk: on('chunk'),
    onAudioEnd: on('end'),
    onAudioStop: on('stop'),
    cardAction: () => {},
    setInteractive: () => {},
    audioLevel: () => {},
    audioDone: () => {},
    ready: () => {
      ready++
    }
  } as unknown as CielApi
  return {
    api,
    emit: (channel, payload) => (listeners.get(channel) ?? []).forEach((l) => l(payload)),
    readyCalls: () => ready
  }
}

let fake: ReturnType<typeof fakeApi>
beforeEach(() => {
  fake = fakeApi()
  window.ciel = fake.api
})
afterEach(cleanup)

describe('Overlay', () => {
  it('tells main it is ready after subscribing', () => {
    render(<Overlay />)
    expect(fake.readyCalls()).toBeGreaterThan(0)
  })

  it('starts in the corner layout', () => {
    render(<Overlay />)
    expect(screen.getByTestId('overlay').getAttribute('data-layout')).toBe('corner')
  })

  it('switches to the stage layout when main says so', () => {
    render(<Overlay />)
    act(() => fake.emit('layout', 'stage' satisfies OverlayLayout))
    expect(screen.getByTestId('overlay').getAttribute('data-layout')).toBe('stage')
  })

  it('shows the emblem when there is no avatar model', () => {
    render(<Overlay />)
    expect(screen.getByTestId('emblem')).toBeTruthy()
    expect(screen.queryByTestId('avatar')).toBeNull()
  })

  it('shows the avatar, minimised to her eyes while idle in the corner', () => {
    render(<Overlay />)
    act(() => fake.emit('avatar', 'ciel-asset://persona/avatar.vrm'))
    expect(screen.queryByTestId('emblem')).toBeNull()
    expect(screen.getByTestId('avatar').getAttribute('data-framing')).toBe('eyes')
    act(() => fake.emit('emblem', 'speaking'))
    expect(screen.getByTestId('avatar').getAttribute('data-framing')).toBe('full')
  })

  it('falls back to the emblem if the model fails to load', () => {
    render(<Overlay />)
    act(() => fake.emit('avatar', 'ciel-asset://persona/avatar.vrm'))
    act(() => avatarErrors.at(-1)?.(new Error('bad file')))
    expect(screen.getByTestId('emblem')).toBeTruthy()
  })
})
