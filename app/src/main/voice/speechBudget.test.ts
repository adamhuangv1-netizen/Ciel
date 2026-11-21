import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SpeechBudget, type AccountUsage } from './speechBudget'

const DAY_MS = 24 * 60 * 60 * 1000
const START = new Date(2026, 10, 21, 10, 0, 0).getTime() // local 10:00
const T = Math.floor(START / 1000) + 5 * 24 * 3600 // reset in 5 days (unix seconds)
const USAGE: AccountUsage = {
  characterLimit: 131000,
  characterCount: 45462,
  nextCharacterCountResetUnix: T
}

let statePath: string
let clock: number
const now = (): number => clock

function budget(): SpeechBudget {
  return new SpeechBudget({ statePath, now })
}

beforeEach(() => {
  statePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ciel-budget-')), 'speech.json')
  clock = START
})

describe('SpeechBudget', () => {
  it('gives a daily allowance of a thirtieth of the monthly limit', () => {
    const b = budget()
    b.sync(USAGE)
    expect(b.dailyAllowance()).toBe(4366)
  })

  it('speaks only requests and answers once the day is low', async () => {
    const b = budget()
    b.sync(USAGE)
    await b.record(3500)
    expect(b.decide(100, 'notice')).toBe('skip')
    expect(b.decide(100, 'answer')).toBe('speak')
  })

  it('skips everything that does not fit in what is left today', async () => {
    const b = budget()
    b.sync(USAGE)
    await b.record(4300)
    expect(b.decide(100, 'request')).toBe('skip')
  })

  it('starts a fresh day at midnight', async () => {
    const b = budget()
    b.sync(USAGE)
    await b.record(4300)
    clock = START + DAY_MS
    expect(b.usedToday()).toBe(0)
  })

  it('skips when the account itself is nearly empty', () => {
    const b = budget()
    b.sync({ ...USAGE, characterCount: 130990 })
    expect(b.decide(50, 'request')).toBe('skip')
  })

  it('stays silent after a quota error until the account resets, across restarts', () => {
    const b = budget()
    b.sync(USAGE)
    b.markExhausted('quota')
    expect(b.decide(10, 'request')).toBe('skip')
    expect(b.exhaustedUntil()).toBe(T)

    const restarted = budget()
    restarted.sync(USAGE)
    expect(restarted.isExhausted()).toBe(true)
    expect(restarted.decide(10, 'request')).toBe('skip')

    clock = T * 1000 + 1000
    expect(restarted.isExhausted()).toBe(false)
    expect(restarted.decide(10, 'request')).toBe('speak')
  })

  it('treats an auth failure as in-memory only', () => {
    const b = budget()
    b.sync(USAGE)
    b.markExhausted('auth')
    expect(b.decide(10, 'request')).toBe('skip')

    const restarted = budget()
    restarted.sync(USAGE)
    expect(restarted.decide(10, 'request')).toBe('speak')

    b.clearExhausted()
    expect(b.decide(10, 'request')).toBe('speak')
  })

  it('asks for a fresh account reading before the first one, after the monthly reset, and every 6 hours', () => {
    const b = budget()
    expect(b.syncDue()).toBe(true)
    b.sync({ ...USAGE, nextCharacterCountResetUnix: Math.floor(clock / 1000) + 3600 })
    expect(b.syncDue()).toBe(false)
    clock += 3601_000 // past the reset
    expect(b.syncDue()).toBe(true)
    b.sync(USAGE)
    expect(b.syncDue()).toBe(false)
    clock += 6 * 3600_000
    expect(b.syncDue()).toBe(true)
  })

  it("keeps the day's usage across restarts", async () => {
    const b = budget()
    b.sync(USAGE)
    await b.record(1234)
    const restarted = budget()
    restarted.sync(USAGE)
    expect(restarted.usedToday()).toBe(1234)
  })
})
