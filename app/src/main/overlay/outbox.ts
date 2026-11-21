export interface Outbox {
  /** Send now if the renderer is ready, otherwise queue. */
  post(channel: string, payload: unknown): void
  /** The renderer has subscribed: flush the queue in order and send directly from now on. */
  ready(): void
  /** The renderer reloaded: queue again until the next ready(). */
  reset(): void
}

export function createOutbox(send: (channel: string, payload: unknown) => void): Outbox {
  let isReady = false
  const queue: [string, unknown][] = []
  return {
    post(channel, payload) {
      if (isReady) send(channel, payload)
      else queue.push([channel, payload])
    },
    ready() {
      isReady = true
      for (const [channel, payload] of queue.splice(0)) send(channel, payload)
    },
    reset() {
      isReady = false
    }
  }
}
