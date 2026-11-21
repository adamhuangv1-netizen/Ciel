import { app, type Tray } from 'electron'
import { randomUUID } from 'node:crypto'
import { electronApp } from '@electron-toolkit/utils'
import { DEFAULT_THEME, type Card } from '../shared/types'
import { createOverlayWindow, type OverlayHandle } from './overlay/overlayWindow'
import { createTray } from './tray'

let tray: Tray | null = null // module-level so it isn't garbage-collected
let overlay: OverlayHandle | null = null

function start(): void {
  electronApp.setAppUserModelId('com.ciel.app')
  overlay = createOverlayWindow(DEFAULT_THEME)
  overlay.setEmblem('idle')
  overlay.onCardAction((cardId) => overlay?.dismissCard(cardId))

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
      tray?.destroy()
      app.quit()
    }
  })

  // Dev-only visual check: CIEL_DEMO=1 shows one card of each kind.
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
