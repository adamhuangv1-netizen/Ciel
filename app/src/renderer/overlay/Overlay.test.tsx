// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import type { CielApi, OverlayLayout } from '../../shared/types'
import { Overlay } from './Overlay'

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
})
