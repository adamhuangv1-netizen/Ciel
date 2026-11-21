export type CardKind = 'notice' | 'answer' | 'report' | 'request'

export type EmblemState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'alert'

/** corner: emblem bottom-right over the desktop. stage: large centred emblem on a dark backdrop (a dedicated monitor). */
export type OverlayLayout = 'corner' | 'stage'

export interface CardAction {
  id: 'approve' | 'deny' | 'always' | 'open' | 'dismiss'
  label: string
}

export interface Card {
  id: string
  kind: CardKind
  body: string
  actions?: CardAction[]
  createdAt: number
}

const TAGS = {
  notice: 'NOTICE',
  answer: 'ANSWER',
  report: 'REPORT',
  request: 'REQUEST'
} as const satisfies Record<CardKind, string>

export function cardTag(kind: CardKind): (typeof TAGS)[CardKind] {
  return TAGS[kind]
}

/** Emblem colours (CSS hex). Persona packs supply these; Task 2's loader validates them. */
export interface EmblemTheme {
  core: string
  ring: string
  glow: string
  alert: string
}

export const DEFAULT_THEME: EmblemTheme = {
  core: '#d8f3ff',
  ring: '#5cc8ff',
  glow: '#7fdcff',
  alert: '#ffb347'
}

export interface AudioChunk {
  utteranceId: string
  bytes: Uint8Array
}

/** The API the overlay preload exposes as `window.ciel`. Subscribers return an unsubscribe function. */
export interface CielApi {
  onCard(cb: (card: Card) => void): () => void
  onDismiss(cb: (cardId: string) => void): () => void
  onEmblem(cb: (state: EmblemState) => void): () => void
  onTheme(cb: (theme: EmblemTheme) => void): () => void
  onLayout(cb: (layout: OverlayLayout) => void): () => void
  cardAction(cardId: string, actionId: CardAction['id']): void
  setInteractive(on: boolean): void
  onAudioChunk(cb: (chunk: AudioChunk) => void): () => void
  onAudioEnd(cb: (utteranceId: string) => void): () => void
  onAudioStop(cb: () => void): () => void
  audioLevel(level: number): void
  audioDone(utteranceId: string): void
  /** Call once all subscriptions are in place; main holds messages until then. */
  ready(): void
}

export const CARD_ACTION_IDS: readonly CardAction['id'][] = [
  'approve',
  'deny',
  'always',
  'open',
  'dismiss'
]

export const IPC = {
  ready: 'overlay:ready',
  theme: 'overlay:theme',
  layout: 'overlay:layout',
  showCard: 'overlay:show-card',
  dismissCard: 'overlay:dismiss-card',
  cardAction: 'overlay:card-action',
  setEmblem: 'overlay:set-emblem',
  setInteractive: 'overlay:set-interactive',
  audioChunk: 'audio:chunk',
  audioEnd: 'audio:end',
  audioStop: 'audio:stop',
  audioLevel: 'audio:level',
  audioDone: 'audio:done'
} as const
