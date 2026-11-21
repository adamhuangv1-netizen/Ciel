import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type CielApi } from '../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: CielApi = {
  onCard: (cb) => subscribe(IPC.showCard, cb),
  onDismiss: (cb) => subscribe(IPC.dismissCard, cb),
  onEmblem: (cb) => subscribe(IPC.setEmblem, cb),
  onTheme: (cb) => subscribe(IPC.theme, cb),
  onLayout: (cb) => subscribe(IPC.layout, cb),
  cardAction: (cardId, actionId) => ipcRenderer.send(IPC.cardAction, cardId, actionId),
  setInteractive: (on) => ipcRenderer.send(IPC.setInteractive, on),
  onAudioChunk: (cb) => subscribe(IPC.audioChunk, cb),
  onAudioEnd: (cb) => subscribe(IPC.audioEnd, cb),
  onAudioStop: (cb) => subscribe(IPC.audioStop, () => cb()),
  audioLevel: (level) => ipcRenderer.send(IPC.audioLevel, level),
  audioDone: (utteranceId) => ipcRenderer.send(IPC.audioDone, utteranceId),
  ready: () => ipcRenderer.send(IPC.ready)
}

contextBridge.exposeInMainWorld('ciel', api)
