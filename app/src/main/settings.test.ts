import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './settings'

let file: string
beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ciel-settings-')), 'settings.json')
})

describe('settings', () => {
  it('falls back to defaults when the file is missing', () => {
    expect(loadSettings(file)).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS).toEqual({ displayId: null, layout: 'corner' })
  })

  it('fills in missing fields from defaults', () => {
    fs.writeFileSync(file, JSON.stringify({ layout: 'stage' }))
    expect(loadSettings(file)).toEqual({ displayId: null, layout: 'stage' })
  })

  it('ignores invalid values', () => {
    fs.writeFileSync(file, JSON.stringify({ layout: 'huge', displayId: 'two' }))
    expect(loadSettings(file)).toEqual(DEFAULT_SETTINGS)
  })

  it('survives a corrupt file', () => {
    fs.writeFileSync(file, '{not json')
    expect(loadSettings(file)).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips and keeps keys it does not own', () => {
    fs.writeFileSync(file, JSON.stringify({ quietHours: [22, 7] }))
    saveSettings(file, { displayId: 42, layout: 'stage' })
    expect(loadSettings(file)).toEqual({ displayId: 42, layout: 'stage' })
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).quietHours).toEqual([22, 7])
  })
})
