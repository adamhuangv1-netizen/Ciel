import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IPC } from '../../shared/types'
import { createAudioSink } from './audioSink'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup(): { sent: [string, unknown][]; speaking: boolean[]; sink: ReturnType<typeof createAudioSink> } {
  const sent: [string, unknown][] = []
  const speaking: boolean[] = []
  const sink = createAudioSink({ send: (c, p) => sent.push([c, p]), sampleRate: 24_000 })
  sink.onSpeaking((on) => speaking.push(on))
  return { sent, speaking, sink }
}

describe('createAudioSink', () => {
  it('forwards chunks with their sample rate, then the end', () => {
    const { sent, sink } = setup()
    sink.chunk('u1', new Uint8Array([1, 2]))
    sink.end('u1')
    expect(sent).toEqual([
      [IPC.audioChunk, { utteranceId: 'u1', bytes: new Uint8Array([1, 2]), sampleRate: 24_000 }],
      [IPC.audioEnd, 'u1']
    ])
  })

  it('resolves done when the overlay reports the utterance finished', async () => {
    const { sink } = setup()
    sink.chunk('u1', new Uint8Array(4))
    sink.end('u1')
    const done = vi.fn()
    void sink.done('u1').then(done)
    sink.ack('u1')
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toHaveBeenCalled()
  })

  it('still resolves if the overlay reported done before anyone waited', async () => {
    const { sink } = setup()
    sink.chunk('u1', new Uint8Array(4))
    sink.end('u1')
    sink.ack('u1')
    await expect(sink.done('u1')).resolves.toBeUndefined()
  })

  it('gives up waiting once the audio should have finished, so a dead overlay never stalls speech', async () => {
    const { sink } = setup()
    sink.chunk('u1', new Uint8Array(48_000)) // 1 s of 16-bit audio at 24 kHz
    sink.end('u1')
    const done = vi.fn()
    void sink.done('u1').then(done)
    await vi.advanceTimersByTimeAsync(3_900)
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(done).toHaveBeenCalled()
  })

  it('reports speaking from the first chunk until done, and stop ends it', async () => {
    const { sent, speaking, sink } = setup()
    sink.chunk('u1', new Uint8Array(4))
    sink.chunk('u1', new Uint8Array(4))
    sink.end('u1')
    sink.ack('u1')
    await sink.done('u1')
    expect(speaking).toEqual([true, false])

    sink.chunk('u2', new Uint8Array(4))
    const done = vi.fn()
    void sink.done('u2').then(done)
    sink.stop()
    await vi.advanceTimersByTimeAsync(0)
    expect(sent.at(-1)).toEqual([IPC.audioStop, undefined])
    expect(speaking).toEqual([true, false, true, false])
    expect(done).toHaveBeenCalled()
  })
})
