import { app, screen } from 'electron'
import { randomUUID } from 'node:crypto'
import { electronApp } from '@electron-toolkit/utils'
import { DEFAULT_THEME, type Card } from '../shared/types'
import { cielPaths } from './paths'
import { loadSettings, saveSettings, type Settings } from './settings'
import { displayLabel } from './overlay/bounds'
import { createOverlayWindow, type OverlayHandle } from './overlay/overlayWindow'
import { createTray, type TrayHandle } from './tray'

let tray: TrayHandle | null = null // module-level so it isn't garbage-collected
let overlay: OverlayHandle | null = null

function start(): void {
  electronApp.setAppUserModelId('com.ciel.app')
  const paths = cielPaths(app.getPath('appData'))
  let settings: Settings = loadSettings(paths.settings)

  // Dev-only visual checks: CIEL_DEMO_LAYOUT=stage previews the stage layout without saving it.
  const demoLayout = process.env['CIEL_DEMO_LAYOUT']
  const startLayout =
    !app.isPackaged && (demoLayout === 'stage' || demoLayout === 'corner') ? demoLayout : settings.layout

  overlay = createOverlayWindow(DEFAULT_THEME, { displayId: settings.displayId, layout: startLayout })
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
