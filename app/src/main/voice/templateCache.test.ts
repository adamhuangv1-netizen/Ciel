import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { TemplateCache, TEMPLATE_PHRASES } from './templateCache'

let dir: string
beforeEach(() => {
  dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ciel-cache-')), 'tts')
})

describe('TemplateCache', () => {
  it('round-trips the audio for a phrase', async () => {
    const cache = new TemplateCache({ dir, voiceId: 'v1', modelId: 'm1' })
    await cache.put('Notice. Download complete.', new Uint8Array([1, 2, 3, 250]))
    expect(await cache.get('Notice. Download complete.')).toEqual(new Uint8Array([1, 2, 3, 250]))
  })

  it('misses for a different voice, model or phrase', async () => {
    await new TemplateCache({ dir, voiceId: 'v1', modelId: 'm1' }).put('Hello.', new Uint8Array([7]))
    expect(await new TemplateCache({ dir, voiceId: 'v2', modelId: 'm1' }).get('Hello.')).toBeNull()
    expect(await new TemplateCache({ dir, voiceId: 'v1', modelId: 'm2' }).get('Hello.')).toBeNull()
    expect(await new TemplateCache({ dir, voiceId: 'v1', modelId: 'm1' }).get('Goodbye.')).toBeNull()
  })

  it('lists the fixed notice phrases', () => {
    expect(TEMPLATE_PHRASES).toEqual([
      'Notice. Download complete.',
      'Notice. Process finished.',
      'Notice. Disk space is low.',
      'Notice. An application crashed.'
    ])
  })
})
