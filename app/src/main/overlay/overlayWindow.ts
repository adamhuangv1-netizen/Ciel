import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import {
  CARD_ACTION_IDS,
  IPC,
  type AvatarSource,
  type Card,
  type CardAction,
  type EmblemState,
  type EmblemTheme,
  type OverlayLayout
} from '../../shared/types'
import { overlayBounds, pickDisplay } from './bounds'
import { createOutbox } from './outbox'
import { createOverlayState } from './overlayState'
import { createDismissTimers } from './dismissTimers'
import { createReloadPolicy } from './rendererRecovery'

export interface OverlayHandle {
  /** With waitForSpeech, the card's auto-dismiss countdown starts at restartDismissTimer (its speech ended). */
  showCard(c: Card, opts?: { waitForSpeech?: boolean }): void
  dismissCard(id: string): void
  setEmblem(s: EmblemState): void
  onCardAction(cb: (cardId: string, actionId: CardAction['id']) => void): void
  sendAudio(channel: string, payload: unknown): void
  /** The card's speech ended: start its auto-dismiss countdown. No-op for request cards. */
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
  /** The persona's portrait or VRM model, or null to show the emblem. */
  avatar: AvatarSource | null
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
  const dismissTimers = createDismissTimers((id) => handle.dismissCard(id))
  let rendererReady = false
  const direct = (channel: string, payload: unknown): void => {
    if (rendererReady && !win.isDestroyed()) win.webContents.send(channel, payload)
  }
  const outbox = createOutbox((channel, payload) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
  // A reload or crash never delivers pointerleave, so make the window click-through again
  // rather than leave a transparent window swallowing every click.
  const releasePointer = (): void => {
    if (win.isDestroyed()) return
    win.setIgnoreMouseEvents(true, { forward: true })
    dismissTimers.setHovering(false)
  }
  win.webContents.on('did-start-loading', () => {
    rendererReady = false
    outbox.reset()
    releasePointer()
  })
  ipcMain.on(IPC.ready, (e) => {
    if (e.sender !== win.webContents) return
    rendererReady = true
    direct(IPC.theme, theme)
    direct(IPC.layout, layout)
    direct(IPC.avatar, opts.avatar)
    for (const [channel, payload] of view.replay()) direct(channel, payload)
    outbox.ready()
  })
  win.once('ready-to-show', () => win.showInactive())
  if (is.dev) {
    // The overlay has no devtools open; surface its warnings and errors in the terminal.
    win.webContents.on('console-message', (e) => {
      if (e.level === 'warning' || e.level === 'error')
        console.log(`[overlay ${e.level}] ${e.message}`)
    })
  }
  // A crashed overlay reloads itself (main replays the cards on ready), a few times a minute at most.
  const mayReload = createReloadPolicy()
  win.webContents.on('render-process-gone', (_e, d) => {
    console.error('overlay renderer gone:', d.reason)
    releasePointer()
    if (d.reason === 'clean-exit' || win.isDestroyed()) return
    if (mayReload(Date.now()))
      setTimeout(() => !win.isDestroyed() && win.webContents.reload(), 1_000)
  })

  ipcMain.on(IPC.setInteractive, (e, on: unknown) => {
    if (e.sender !== win.webContents || typeof on !== 'boolean') return
    win.setIgnoreMouseEvents(!on, { forward: true })
    dismissTimers.setHovering(on)
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

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay/index.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/overlay/index.html'))
  }

  const handle: OverlayHandle = {
    showCard(c, showOpts) {
      view.addCard(c)
      direct(IPC.showCard, c)
      dismissTimers.shown(c, { waitForSpeech: showOpts?.waitForSpeech ?? false })
    },
    dismissCard(id) {
      dismissTimers.removed(id)
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
      dismissTimers.speechDone(id)
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
