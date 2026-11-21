export type CardKind = 'notice' | 'answer' | 'report' | 'request'

export type EmblemState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'alert'

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

export const IPC = {
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
