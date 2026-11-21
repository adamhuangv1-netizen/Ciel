import { IPC, type AudioChunk } from '../../shared/types'
import type { AudioSink } from './speechQueue'

/** Extra wait past an utterance's own length before giving up on the overlay's "done". */
const GRACE_MS = 3_000

export interface OverlayAudioSink extends AudioSink {
  /** The overlay reported this utterance finished playing (IPC.audioDone). */
  ack(utteranceId: string): void
  /** true from an utterance's first chunk until it finishes or is stopped. */
  onSpeaking(cb: (on: boolean) => void): void
}

/**
 * Sends audio to the overlay over IPC and turns its "done" replies into promises. If the overlay
 * never answers (reloaded, crashed), done still resolves once the audio should have finished.
 */
export function createAudioSink(opts: { send: (channel: string, payload: unknown) => void; sampleRate: number }): OverlayAudioSink {
  const bytesSent = new Map<string, number>()
  const waiters = new Map<string, () => void>()
  const finished = new Set<string>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const speakingListeners: ((on: boolean) => void)[] = []
  let speakingId: string | null = null

  const setSpeaking = (id: string | null): void => {
    const was = speakingId !== null
    speakingId = id
    if (was !== (id !== null)) for (const cb of speakingListeners) cb(id !== null)
  }

  const complete = (id: string): void => {
    clearTimeout(timers.get(id))
    timers.delete(id)
    bytesSent.delete(id)
    if (speakingId === id) setSpeaking(null)
    const w = waiters.get(id)
    if (w) {
      waiters.delete(id)
      w()
    } else {
      finished.add(id)
      // Stopped utterances are never awaited; keep only recent ones.
      if (finished.size > 64) finished.delete(finished.values().next().value as string)
    }
  }

  return {
    chunk(id, bytes) {
      bytesSent.set(id, (bytesSent.get(id) ?? 0) + bytes.length)
      if (speakingId !== id) setSpeaking(id)
      const payload: AudioChunk = { utteranceId: id, bytes, sampleRate: opts.sampleRate }
      opts.send(IPC.audioChunk, payload)
    },
    end(id) {
      opts.send(IPC.audioEnd, id)
      const seconds = (bytesSent.get(id) ?? 0) / 2 / opts.sampleRate
      timers.set(
        id,
        setTimeout(() => complete(id), seconds * 1000 + GRACE_MS)
      )
    },
    stop() {
      opts.send(IPC.audioStop, undefined)
      for (const id of [...waiters.keys(), ...bytesSent.keys()]) complete(id)
      setSpeaking(null)
    },
    done(id) {
      if (finished.delete(id)) return Promise.resolve()
      return new Promise<void>((resolve) => waiters.set(id, resolve))
    },
    ack(id) {
      complete(id)
    },
    onSpeaking(cb) {
      speakingListeners.push(cb)
    }
  }
}
