import fs from 'node:fs'
import path from 'node:path'
import type { OverlayLayout } from '../shared/types'

/** Settings this module owns. Other keys in settings.json (from later milestones) are preserved on save. */
export interface Settings {
  /** Electron display id to show the overlay on; null = the primary display. */
  displayId: number | null
  layout: OverlayLayout
}

export const DEFAULT_SETTINGS: Settings = { displayId: null, layout: 'corner' }

function readRaw(file: string): Record<string, unknown> {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    return raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export function loadSettings(file: string): Settings {
  const raw = readRaw(file)
  const displayId =
    typeof raw.displayId === 'number' && Number.isInteger(raw.displayId)
      ? raw.displayId
      : DEFAULT_SETTINGS.displayId
  const layout =
    raw.layout === 'corner' || raw.layout === 'stage' ? raw.layout : DEFAULT_SETTINGS.layout
  return { displayId, layout }
}

export function saveSettings(file: string, s: Settings): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ ...readRaw(file), ...s }, null, 2))
}
