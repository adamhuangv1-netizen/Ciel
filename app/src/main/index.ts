import { app, protocol, screen } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { electronApp } from '@electron-toolkit/utils'
import { DEFAULT_THEME, type Card, type EmblemTheme } from '../shared/types'
import { cielPaths } from './paths'
import { loadSettings, saveSettings, type Settings } from './settings'
import { loadPersona } from './persona'
import { ASSET_SCHEME, AVATAR_URL, resolveAsset } from './assets'
import { displayLabel } from './overlay/bounds'
import { createOverlayWindow, type OverlayHandle } from './overlay/overlayWindow'
import { createTray, type TrayHandle } from './tray'

let tray: TrayHandle | null = null // module-level so it isn't garbage-collected
let overlay: OverlayHandle | null = null

// Must happen before 'ready'. fetch support lets three.js's loader read the avatar.
protocol.registerSchemesAsPrivileged([
  { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
])

/** Dev: the repo's personas/ciel. Packaged: %APPDATA%/Ciel/persona. CIEL_PERSONA_DIR overrides both. */
function personaDir(): string {
  const override = process.env['CIEL_PERSONA_DIR']
  if (override) return override
  return app.isPackaged
    ? path.join(app.getPath('appData'), 'Ciel', 'persona')
    : path.join(app.getAppPath(), '..', 'personas', 'ciel')
}

async function start(): Promise<void> {
  electronApp.setAppUserModelId('com.ciel.app')
  const paths = cielPaths(app.getPath('appData'))
  let settings: Settings = loadSettings(paths.settings)

  let theme: EmblemTheme = DEFAULT_THEME
  let avatarPath: string | null = null
  try {
    const persona = await loadPersona(personaDir())
    theme = persona.emblem
    avatarPath = persona.avatarPath
  } catch (e) {
    console.error('persona pack not loaded; using defaults:', (e as Error).message)
  }

  protocol.handle(ASSET_SCHEME, async (req) => {
    const file = resolveAsset(req.url, avatarPath)
    if (!file) return new Response('Not found', { status: 404 })
    return new Response(await readFile(file), {
      headers: { 'content-type': 'model/gltf-binary', 'access-control-allow-origin': '*' }
    })
  })

  // Dev-only visual checks: CIEL_DEMO_LAYOUT=stage previews the stage layout without saving it.
  const demoLayout = process.env['CIEL_DEMO_LAYOUT']
  const startLayout =
    !app.isPackaged && (demoLayout === 'stage' || demoLayout === 'corner') ? demoLayout : settings.layout

  overlay = createOverlayWindow(theme, {
    displayId: settings.displayId,
    layout: startLayout,
    avatarUrl: avatarPath ? AVATAR_URL : null
  })
  overlay.setEmblem('idle')
  overlay.onCardAction((cardId) => overlay?.dismissCard(cardId))

  const update = (patch: Partial<Settings>): void => {
    settings = { ...settings, ...patch }
    saveSettings(paths.settings, settings)
  }

  tray = createTray({
    onToggleMute: () => {
      // Ears arrive in M1b.
    },
    onToggleQuiet: () => {
      // Speech arrives in Task 5.
    },
    onTestSpeak: app.isPackaged
      ? undefined
      : () =>
          overlay?.showCard({
            id: randomUUID(),
            kind: 'notice',
            body: 'This is a test line, Master. Everything is in order.',
            createdAt: Date.now()
          }),
    onQuit: () => {
      tray?.tray.destroy()
      app.quit()
    },
    displays: () => {
      const primaryId = screen.getPrimaryDisplay().id
      return [
        { id: null, label: 'Main display (follow Windows)' },
        ...screen.getAllDisplays().map((d, i) => ({ id: d.id, label: displayLabel(d, i, primaryId) }))
      ]
    },
    currentDisplayId: () => settings.displayId,
    onPickDisplay: (id) => {
      update({ displayId: id })
      overlay?.moveToDisplay(id)
    },
    currentLayout: () => settings.layout,
    onPickLayout: (layout) => {
      update({ layout })
      overlay?.setLayout(layout)
    }
  })
  screen.on('display-added', () => tray?.refresh())
  screen.on('display-removed', () => tray?.refresh())

  if (!app.isPackaged && process.env['CIEL_DEMO'] === '1') {
    const demo: [Card['kind'], string][] = [
      ['notice', 'Your download finished: blender-4.5.zip.'],
      ['answer', 'Blender is using 62 % of your CPU right now.'],
      ['request', 'May I move 14 installers from Downloads into Downloads\\Sorted?']
    ]
    demo.forEach(([kind, body], i) =>
      overlay?.showCard({ id: randomUUID(), kind, body, createdAt: Date.now() + i })
    )
    overlay.setEmblem('alert')
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void app.whenReady().then(start)

  // The overlay is never closed by the user; Ciel keeps running from the tray.
  app.on('window-all-closed', () => {})
}
