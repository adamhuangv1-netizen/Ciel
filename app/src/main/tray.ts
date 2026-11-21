import { Menu, Tray, nativeImage } from 'electron'
import icon from '../../resources/icon.png?asset'

export interface TrayHandlers {
  onToggleMute(muted: boolean): void
  onToggleQuiet(quiet: boolean): void
  /** Present only in dev builds. */
  onTestSpeak?(): void
  onQuit(): void
}

export function createTray(h: TrayHandlers): Tray {
  const tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
  let muted = false
  let quiet = false

  const rebuild = (): void => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Mute microphone',
        type: 'checkbox',
        checked: muted,
        click: (item) => {
          muted = item.checked
          h.onToggleMute(muted)
          rebuild()
        }
      },
      {
        label: 'Quiet mode (cards only)',
        type: 'checkbox',
        checked: quiet,
        click: (item) => {
          quiet = item.checked
          h.onToggleQuiet(quiet)
          rebuild()
        }
      },
      ...(h.onTestSpeak
        ? [{ type: 'separator' as const }, { label: 'Say a test line', click: () => h.onTestSpeak?.() }]
        : []),
      { type: 'separator' },
      { label: 'Quit Ciel', click: () => h.onQuit() }
    ])
    tray.setContextMenu(menu)
    tray.setToolTip(muted ? 'Ciel (microphone muted)' : 'Ciel')
  }
  rebuild()
  return tray
}
