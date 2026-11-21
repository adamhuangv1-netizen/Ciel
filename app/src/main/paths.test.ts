import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cielPaths, ensureCielDirs } from './paths'

describe('cielPaths', () => {
  it('roots everything under <appData>/Ciel', () => {
    const p = cielPaths('C:/X')
    const root = path.join('C:/X', 'Ciel')
    expect(p.root).toBe(root)
    expect(p.ttsCache).toBe(path.join(root, 'cache', 'tts'))
    expect(p.settings).toBe(path.join(root, 'settings.json'))
  })
})

describe('ensureCielDirs', () => {
  it('creates every directory field', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ciel-paths-'))
    const p = cielPaths(base)
    await ensureCielDirs(p)
    for (const dir of [p.root, p.stateDir, p.memoryDir, p.logDir, p.workspace, p.ttsCache]) {
      expect(fs.statSync(dir).isDirectory()).toBe(true)
    }
    expect(fs.existsSync(p.settings)).toBe(false)
  })
})
