import { describe, it, expect } from 'vitest'
import { createSentenceSplitter, speakableLead } from './sentences'

function split(...deltas: string[]): string[] {
  const out: string[] = []
  const s = createSentenceSplitter((x) => out.push(x))
  for (const d of deltas) s.push(d)
  s.flush()
  return out
}

describe('createSentenceSplitter', () => {
  it('splits streamed deltas into whole sentences', () => {
    expect(split('Notice. Your ren', 'der finished. Shall I open it?')).toEqual([
      'Notice.',
      'Your render finished.',
      'Shall I open it?'
    ])
  })

  it('does not split on a decimal point', () => {
    expect(split('Load is 3.5 GB.')).toEqual(['Load is 3.5 GB.'])
  })

  it('does not split after an abbreviation', () => {
    expect(split('e.g. this one.')).toEqual(['e.g. this one.'])
  })

  it('does not split on an ellipsis', () => {
    expect(split('Wait...', ' more.')).toEqual(['Wait... more.'])
  })

  it('emits nothing for an unterminated delta until flush', () => {
    const out: string[] = []
    const s = createSentenceSplitter((x) => out.push(x))
    s.push('Still thinking about it')
    expect(out).toEqual([])
    s.flush()
    expect(out).toEqual(['Still thinking about it'])
  })
})

describe('speakableLead', () => {
  it('keeps only the first three sentences', () => {
    expect(speakableLead('One. Two. Three. Four. Five.')).toBe('One. Two. Three.')
  })

  it('cuts one overlong sentence at a word boundary with an ellipsis', () => {
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ') + '.'
    expect(long.length).toBeGreaterThan(400)
    const lead = speakableLead(long)
    expect(lead.length).toBeLessThanOrEqual(300)
    expect(lead.endsWith('…')).toBe(true)
    const body = lead.slice(0, -1)
    expect(long.startsWith(body)).toBe(true)
    expect(long[body.length]).toBe(' ')
  })
})
