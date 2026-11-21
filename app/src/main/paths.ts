import path from 'node:path'
import { mkdir } from 'node:fs/promises'

export interface CielPaths {
  root: string
  settings: string
  stateDir: string
  memoryDir: string
  logDir: string
  workspace: string
  ttsCache: string
}

export function cielPaths(appDataDir: string): CielPaths {
  const root = path.join(appDataDir, 'Ciel')
  return {
    root,
    settings: path.join(root, 'settings.json'),
    stateDir: path.join(root, 'state'),
    memoryDir: path.join(root, 'memory'),
    logDir: path.join(root, 'log'),
    workspace: path.join(root, 'workspace'),
    ttsCache: path.join(root, 'cache', 'tts')
  }
}

export async function ensureCielDirs(p: CielPaths): Promise<void> {
  for (const dir of [p.root, p.stateDir, p.memoryDir, p.logDir, p.workspace, p.ttsCache]) {
    await mkdir(dir, { recursive: true })
  }
}
