import fs from 'node:fs'
import path from 'node:path'

export type SpeechPriority = 'request' | 'answer' | 'notice'

/** From ElevenLabs `client.user.subscription.get()`. */
export interface AccountUsage {
  characterLimit: number
  characterCount: number
  /** Unix seconds. */
  nextCharacterCountResetUnix: number
}

interface PersistedState {
  day: string
  used: number
  /** Unix seconds; only set for quota exhaustion. */
  exhaustedUntil?: number
  /** Last known monthly limit, so the allowance is known before the first sync. */
  limit?: number
}

const LOW_FRACTION = 0.2
/** Re-read the account at least this often, since its usage moves with use elsewhere too. */
const RESYNC_MS = 6 * 60 * 60 * 1000
const DAYS_PER_MONTH = 30

function dayKey(ms: number): string {
  const d = new Date(ms)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export class SpeechBudget {
  private readonly statePath: string
  private readonly now: () => number
  private state: PersistedState
  private account: AccountUsage | null = null
  private usedSinceSync = 0
  private syncedAt: number | null = null
  private authFailed = false

  constructor(opts: { statePath: string; now?: () => number }) {
    this.statePath = opts.statePath
    this.now = opts.now ?? Date.now
    this.state = this.load()
  }

  sync(u: AccountUsage): void {
    this.account = u
    this.syncedAt = this.now()
    this.usedSinceSync = 0
    this.state.limit = u.characterLimit
    this.persist()
  }

  /** True before the first account reading, once the monthly reset has passed, and every 6 hours. */
  syncDue(): boolean {
    if (!this.account || this.syncedAt === null) return true
    if (this.now() / 1000 >= this.account.nextCharacterCountResetUnix) return true
    return this.now() - this.syncedAt >= RESYNC_MS
  }

  dailyAllowance(): number {
    const limit = this.account?.characterLimit ?? this.state.limit ?? 0
    return Math.floor(limit / DAYS_PER_MONTH)
  }

  usedToday(): number {
    return this.state.day === dayKey(this.now()) ? this.state.used : 0
  }

  decide(chars: number, p: SpeechPriority): 'speak' | 'skip' {
    if (this.isExhausted()) return 'skip'
    const allowance = this.dailyAllowance()
    const remainingToday = allowance - this.usedToday()
    if (chars > remainingToday) return 'skip'
    if (this.account) {
      const accountLeft =
        this.account.characterLimit - this.account.characterCount - this.usedSinceSync
      if (chars > accountLeft) return 'skip'
    }
    const low = remainingToday < allowance * LOW_FRACTION
    if (low && p === 'notice') return 'skip'
    return 'speak'
  }

  async record(chars: number): Promise<void> {
    const today = dayKey(this.now())
    if (this.state.day !== today) this.state = { ...this.state, day: today, used: 0 }
    this.state.used += chars
    this.usedSinceSync += chars
    this.persist()
  }

  markExhausted(reason: 'quota' | 'auth'): void {
    if (reason === 'auth') {
      this.authFailed = true
      return
    }
    // Without a known reset time, stay silent for a day, then retry.
    this.state.exhaustedUntil =
      this.account?.nextCharacterCountResetUnix ?? Math.floor(this.now() / 1000) + 24 * 3600
    this.persist()
  }

  clearExhausted(): void {
    this.authFailed = false
    delete this.state.exhaustedUntil
    this.persist()
  }

  isExhausted(): boolean {
    if (this.authFailed) return true
    const until = this.state.exhaustedUntil
    return until !== undefined && this.now() / 1000 <= until
  }

  exhaustedUntil(): number | null {
    return this.isExhausted() ? (this.state.exhaustedUntil ?? null) : null
  }

  private load(): PersistedState {
    try {
      const raw = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as Partial<PersistedState>
      if (typeof raw.day === 'string' && typeof raw.used === 'number') {
        return raw as PersistedState
      }
    } catch {
      // Missing or unreadable state: start fresh.
    }
    return { day: dayKey(this.now()), used: 0 }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true })
    fs.writeFileSync(this.statePath, JSON.stringify(this.state))
  }
}
