import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron'
import icon from '../../resources/icon.png?asset'
import type { OverlayLayout } from '../shared/types'

export interface TrayDisplayOption {
  /** null = follow the primary display. */
  id: number | null
  label: string
}

export interface TrayHandlers {
  onToggleMute(muted: boolean): void
  onToggleQuiet(quiet: boolean): void
  /** Present only in dev builds. */
  onTestSpeak?(): void
  onQuit(): void
  /** Monitors to offer, read fresh each time the menu is rebuilt. */
  displays(): TrayDisplayOption[]
  currentDisplayId(): number | null
  onPickDisplay(id: number | null): void
  currentLayout(): OverlayLayout
  onPickLayout(layout: OverlayLayout): void
}

export interface TrayHandle {
  tray: Tray
  /** Rebuild the menu, e.g. after a monitor is plugged in or removed. */
  refresh(): void
}

export function createTray(h: TrayHandlers): TrayHandle {
  const tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
  let muted = false
  let quiet = false

  const rebuild = (): void => {
    const displayItems: MenuItemConstructorOptions[] = h.displays().map((d) => ({
      label: d.label,
      type: 'radio',
      checked: d.id === h.currentDisplayId(),
      click: () => {
        h.onPickDisplay(d.id)
        rebuild()
      }
    }))
    const layoutItems: MenuItemConstructorOptions[] = (
      [
        ['corner', 'Corner (small, over the desktop)'],
        ['stage', 'Stage (large, fills the monitor)']
      ] as const
    ).map(([value, label]) => ({
      label,
      type: 'radio',
      checked: h.currentLayout() === value,
      click: () => {
        h.onPickLayout(value)
        rebuild()
      }
    }))

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
      { type: 'separator' },
      { label: 'Show on', submenu: displayItems },
      { label: 'Layout', submenu: layoutItems },
      ...(h.onTestSpeak
        ? [
            { type: 'separator' as const },
            { label: 'Say a test line', click: () => h.onTestSpeak?.() }
          ]
        : []),
      { type: 'separator' },
      { label: 'Quit Ciel', click: () => h.onQuit() }
    ])
    tray.setContextMenu(menu)
    tray.setToolTip(muted ? 'Ciel (microphone muted)' : 'Ciel')
  }
  rebuild()
  return { tray, refresh: rebuild }
}
