import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadPersona, PersonaError, sampleRateOf } from './persona'

const VOICE = {
  voiceId: 'test-voice',
  modelId: 'test-model',
  outputFormat: 'pcm_24000',
  stability: 0.6,
  similarityBoost: 0.75,
  style: 0.15
}
const EMBLEM = { core: '#d8f3ff', ring: '#5cc8ff', glow: '#7fdcff', alert: '#ffb347' }

function pack(files: { persona?: string; voice?: unknown; emblem?: unknown }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ciel-persona-'))
  fs.writeFileSync(
    path.join(dir, 'persona.md'),
    files.persona ?? '---\nname: Test\naddressAs: Captain\n---\n# Brief\n\nCalm and precise.\n'
  )
  fs.writeFileSync(path.join(dir, 'voice.json'), JSON.stringify(files.voice ?? VOICE))
  fs.writeFileSync(path.join(dir, 'emblem.json'), JSON.stringify(files.emblem ?? EMBLEM))
  return dir
}

describe('loadPersona', () => {
  it('loads a valid pack', async () => {
    const p = await loadPersona(pack({}))
    expect(p.voice.voiceId).toBe('test-voice')
    expect(p.name).toBe('Test')
    expect(p.addressAs).toBe('Captain')
    expect(p.emblem.ring).toBe('#5cc8ff')
  })

  it('names the file and field when voiceId is missing', async () => {
    const { voiceId: _omit, ...noId } = VOICE
    const err = await loadPersona(pack({ voice: noId })).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PersonaError)
    expect((err as Error).message).toContain('voice.json')
    expect((err as Error).message).toContain('voiceId')
  })

  it('defaults addressAs to Master', async () => {
    const p = await loadPersona(pack({ persona: '---\nname: Test\n---\nBody\n' }))
    expect(p.addressAs).toBe('Master')
  })

  it('uses the markdown body without frontmatter as the brief', async () => {
    const p = await loadPersona(pack({}))
    expect(p.brief).toBe('# Brief\n\nCalm and precise.')
  })

  it('rejects an emblem colour that is not a hex colour', async () => {
    const err = await loadPersona(pack({ emblem: { ...EMBLEM, glow: 'red; background:url(x)' } })).catch(
      (e: unknown) => e
    )
    expect(err).toBeInstanceOf(PersonaError)
    expect((err as Error).message).toContain('emblem.json')
    expect((err as Error).message).toContain('glow')
  })
})

describe('loadPersona avatar', () => {
  it('reports avatar.vrm when the pack has one', async () => {
    const dir = pack({})
    fs.writeFileSync(path.join(dir, 'avatar.vrm'), 'glTF')
    expect((await loadPersona(dir)).avatarPath).toBe(path.join(dir, 'avatar.vrm'))
  })

  it('reports no avatar otherwise', async () => {
    expect((await loadPersona(pack({}))).avatarPath).toBeNull()
  })
})

describe('sampleRateOf', () => {
  it('reads the rate from the format name', () => {
    expect(sampleRateOf('pcm_24000')).toBe(24000)
    expect(sampleRateOf('pcm_16000')).toBe(16000)
  })
})
