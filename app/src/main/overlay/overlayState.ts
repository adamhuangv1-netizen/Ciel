import { IPC, type Card, type EmblemState } from '../../shared/types'

/**
 * What the overlay should currently show. Main owns it and replays it whenever the renderer
 * (re)announces it is ready, so a reload or renderer crash never loses a pending REQUEST card.
 */
export interface OverlayState {
  addCard(c: Card): void
  removeCard(id: string): void
  kindOf(id: string): Card['kind'] | undefined
  setEmblem(s: EmblemState): void
  /** Messages that recreate the current view, emblem first, then cards oldest first. */
  replay(): [string, unknown][]
}

export function createOverlayState(): OverlayState {
  const cards = new Map<string, Card>()
  let emblem: EmblemState = 'idle'
  return {
    addCard: (c) => void cards.set(c.id, c),
    removeCard: (id) => void cards.delete(id),
    kindOf: (id) => cards.get(id)?.kind,
    setEmblem: (s) => {
      emblem = s
    },
    replay: () => [
      [IPC.setEmblem, emblem],
      ...[...cards.values()]
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((c): [string, unknown] => [IPC.showCard, c])
    ]
  }
}
