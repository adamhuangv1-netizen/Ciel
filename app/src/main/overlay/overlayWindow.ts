import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import {
  CARD_ACTION_IDS,
  IPC,
  type Card,
  type CardAction,
  type EmblemState,
  type EmblemTheme,
  type OverlayLayout
} from '../../shared/types'
import { overlayBounds, pickDisplay } from './bounds'
import { createOutbox } from './outbox'
import { createOverlayState } from './overlayState'

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
  /** Show the overlay on this monitor (null = primary). Falls back to the primary if it's unplugged. */
  moveToDisplay(displayId: number | null): void
  setLayout(layout: OverlayLayout): void
  /** The overlay finished playing an utterance (IPC.audioDone). */
  onAudioDone(cb: (utteranceId: string) => void): void
}

export interface OverlayOptions {
  displayId: number | null
  layout: OverlayLayout
  /** ciel-asset:// URL of the VRM avatar, or null to show the emblem. */
  avatarUrl: string | null
}

export function createOverlayWindow(theme: EmblemTheme, opts: OverlayOptions): OverlayHandle {
  let preferredId = opts.displayId
  let layout = opts.layout
  const targetWorkArea = (): Electron.Rectangle =>
    pickDisplay(screen.getAllDisplays(), preferredId, screen.getPrimaryDisplay()).workArea

  const win = new BrowserWindow({
    ...overlayBounds(targetWorkArea()),
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
      nodeIntegration: false,
      // Speech plays without a click: the overlay never receives one.
      autoplayPolicy: 'no-user-gesture-required'
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(true, { forward: true })

  const fit = (): void => {
    if (!win.isDestroyed()) win.setBounds(overlayBounds(targetWorkArea()))
  }
  screen.on('display-metrics-changed', fit)
  screen.on('display-added', fit)
  screen.on('display-removed', fit)

  // The view (emblem + cards) is owned here and replayed on every IPC.ready, so a renderer reload
  // or crash never loses a pending REQUEST. did-finish-load is too early: React subscribes later.
  // Transient messages (audio) go through the outbox and are held until ready.
  const view = createOverlayState()
  let rendererReady = false
  const direct = (channel: string, payload: unknown): void => {
    if (rendererReady && !win.isDestroyed()) win.webContents.send(channel, payload)
  }
  const outbox = createOutbox((channel, payload) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
  win.webContents.on('did-start-loading', () => {
    rendererReady = false
    outbox.reset()
  })
  ipcMain.on(IPC.ready, (e) => {
    if (e.sender !== win.webContents) return
    rendererReady = true
    direct(IPC.theme, theme)
    direct(IPC.layout, layout)
    direct(IPC.avatar, opts.avatarUrl)
    for (const [channel, payload] of view.replay()) direct(channel, payload)
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

  const audioDoneListeners: ((utteranceId: string) => void)[] = []
  ipcMain.on(IPC.audioDone, (e, utteranceId: unknown) => {
    if (e.sender !== win.webContents || typeof utteranceId !== 'string') return
    for (const cb of audioDoneListeners) cb(utteranceId)
  })

  const timers = new Map<string, NodeJS.Timeout>()
  const arm = (id: string): void => {
    clearTimeout(timers.get(id))
    if (view.kindOf(id) === 'request') return
    timers.set(id, setTimeout(() => handle.dismissCard(id), AUTO_DISMISS_MS))
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay/index.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/overlay/index.html'))
  }

  const handle: OverlayHandle = {
    showCard(c) {
      view.addCard(c)
      direct(IPC.showCard, c)
      arm(c.id)
    },
    dismissCard(id) {
      clearTimeout(timers.get(id))
      timers.delete(id)
      view.removeCard(id)
      direct(IPC.dismissCard, id)
    },
    setEmblem(s) {
      view.setEmblem(s)
      direct(IPC.setEmblem, s)
    },
    onCardAction(cb) {
      actionListeners.push(cb)
    },
    sendAudio(channel, payload) {
      outbox.post(channel, payload)
    },
    restartDismissTimer(id) {
      if (view.kindOf(id)) arm(id)
    },
    moveToDisplay(displayId) {
      preferredId = displayId
      fit()
    },
    setLayout(next) {
      layout = next
      direct(IPC.layout, next)
    },
    onAudioDone(cb) {
      audioDoneListeners.push(cb)
    }
  }
  return handle
}
