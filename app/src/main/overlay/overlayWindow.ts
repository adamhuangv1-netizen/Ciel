import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import {
  CARD_ACTION_IDS,
  IPC,
  type Card,
  type CardAction,
  type EmblemState,
  type EmblemTheme
} from '../../shared/types'
import { overlayBounds } from './bounds'
import { createOutbox } from './outbox'

/** Non-request cards leave the screen this long after they appear (Task 5 restarts it when speech ends). */
export const AUTO_DISMISS_MS = 12_000

export interface OverlayHandle {
  showCard(c: Card): void
  dismissCard(id: string): void
  setEmblem(s: EmblemState): void
  onCardAction(cb: (cardId: string, actionId: CardAction['id']) => void): void
  sendAudio(channel: string, payload: unknown): void
  /** Re-arm a card's auto-dismiss timer (e.g. when its speech ends). No-op for request cards. */
  restartDismissTimer(id: string): void
}

export function createOverlayWindow(theme: EmblemTheme): OverlayHandle {
  const win = new BrowserWindow({
    ...overlayBounds(screen.getPrimaryDisplay().workArea),
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/overlay.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(true, { forward: true })

  const fit = (): void => win.setBounds(overlayBounds(screen.getPrimaryDisplay().workArea))
  screen.on('display-metrics-changed', fit)
  screen.on('display-added', fit)
  screen.on('display-removed', fit)

  // Messages are held until the renderer has subscribed (IPC.ready), then flushed in order.
  // did-finish-load is too early: React subscribes after the load event, and early messages were lost.
  const outbox = createOutbox((channel, payload) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
  const send = outbox.post
  win.webContents.on('did-start-loading', () => outbox.reset())
  ipcMain.on(IPC.ready, (e) => {
    if (e.sender !== win.webContents) return
    win.webContents.send(IPC.theme, theme)
    outbox.ready()
  })
  win.once('ready-to-show', () => win.showInactive())

  ipcMain.on(IPC.setInteractive, (e, on: unknown) => {
    if (e.sender !== win.webContents || typeof on !== 'boolean') return
    win.setIgnoreMouseEvents(!on, { forward: true })
  })

  const actionListeners: ((cardId: string, actionId: CardAction['id']) => void)[] = []
  ipcMain.on(IPC.cardAction, (e, cardId: unknown, actionId: unknown) => {
    if (e.sender !== win.webContents) return
    if (typeof cardId !== 'string') return
    if (!CARD_ACTION_IDS.includes(actionId as CardAction['id'])) return
    for (const cb of actionListeners) cb(cardId, actionId as CardAction['id'])
  })

  const timers = new Map<string, NodeJS.Timeout>()
  const kinds = new Map<string, Card['kind']>()
  const arm = (id: string): void => {
    clearTimeout(timers.get(id))
    if (kinds.get(id) === 'request') return
    timers.set(id, setTimeout(() => handle.dismissCard(id), AUTO_DISMISS_MS))
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay/index.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/overlay/index.html'))
  }

  const handle: OverlayHandle = {
    showCard(c) {
      kinds.set(c.id, c.kind)
      send(IPC.showCard, c)
      arm(c.id)
    },
    dismissCard(id) {
      clearTimeout(timers.get(id))
      timers.delete(id)
      kinds.delete(id)
      send(IPC.dismissCard, id)
    },
    setEmblem(s) {
      send(IPC.setEmblem, s)
    },
    onCardAction(cb) {
      actionListeners.push(cb)
    },
    sendAudio(channel, payload) {
      send(channel, payload)
    },
    restartDismissTimer(id) {
      if (kinds.has(id)) arm(id)
    }
  }
  return handle
}
