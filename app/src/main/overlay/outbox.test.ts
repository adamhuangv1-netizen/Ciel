import { describe, it, expect } from 'vitest'
import { createOutbox } from './outbox'

function setup() {
  const sent: [string, unknown][] = []
  const box = createOutbox((channel, payload) => sent.push([channel, payload]))
  return { sent, box }
}

describe('createOutbox', () => {
  it('holds messages until the renderer says it is ready, then flushes them in order', () => {
    const { sent, box } = setup()
    box.post('a', 1)
    box.post('b', 2)
    box.post('c', 3)
    expect(sent).toEqual([])
    box.ready()
    expect(sent).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3]
    ])
  })

  it('sends straight through once ready', () => {
    const { sent, box } = setup()
    box.ready()
    box.post('a', 1)
    expect(sent).toEqual([['a', 1]])
  })

  it('queues again after a reload until the next ready', () => {
    const { sent, box } = setup()
    box.ready()
    box.reset()
    box.post('a', 1)
    expect(sent).toEqual([])
    box.ready()
    expect(sent).toEqual([['a', 1]])
  })
})
