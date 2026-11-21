import type { Card } from '../../shared/types'

/** A short card stays this long after it appears (or after its speech ends). */
export const AUTO_DISMISS_MS = 12_000
/** The card's typewriter speed (CardStack's useTypewriter), so long bodies get time to finish. */
const TYPE_MS_PER_CHAR = 18
const MAX_DISMISS_MS = 60_000
/** If a card's speech never reports back, it still goes after this long. */
export const SPEECH_SAFETY_MS = 120_000
/** While the pointer is over a card, check again this often. */
const HOVER_RECHECK_MS = 3_000

export function dismissDelayMs(body: string): number {
  return Math.min(MAX_DISMISS_MS, AUTO_DISMISS_MS + body.length * TYPE_MS_PER_CHAR)
}

export interface DismissTimers {
  /** A card appeared. With waitForSpeech, its countdown starts when speechDone is called. */
  shown(card: Card, opts: { waitForSpeech: boolean }): void
  speechDone(cardId: string): void
  /** The pointer is over a card: nothing is dismissed until it leaves. */
  setHovering(on: boolean): void
  removed(cardId: string): void
}

/**
 * When cards leave the screen. Requests never time out (they wait for a click); other cards stay
 * until their speech has ended, they've had time to type out, and the pointer isn't on them.
 */
export function createDismissTimers(dismiss: (cardId: string) => void): DismissTimers {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const bodies = new Map<string, string>()
  let hovering = false

  const arm = (id: string, ms: number): void => {
    clearTimeout(timers.get(id))
    timers.set(
      id,
      setTimeout(() => {
        if (hovering) return arm(id, HOVER_RECHECK_MS)
        timers.delete(id)
        bodies.delete(id)
        dismiss(id)
      }, ms)
    )
  }

  return {
    shown(card, { waitForSpeech }) {
      if (card.kind === 'request') return
      bodies.set(card.id, card.body)
      arm(card.id, waitForSpeech ? SPEECH_SAFETY_MS : dismissDelayMs(card.body))
    },
    speechDone(id) {
      const body = bodies.get(id)
      if (body !== undefined) arm(id, dismissDelayMs(body))
    },
    setHovering(on) {
      hovering = on
    },
    removed(id) {
      clearTimeout(timers.get(id))
      timers.delete(id)
      bodies.delete(id)
    }
  }
}
