import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { EmblemTheme } from '../shared/types'

export type OutputFormat = 'pcm_24000' | 'pcm_22050' | 'pcm_16000'

export interface VoiceSettings {
  voiceId: string
  modelId: string
  outputFormat: OutputFormat
  stability: number
  similarityBoost: number
  style: number
}

export interface Persona {
  name: string
  addressAs: string
  /** persona.md body (frontmatter removed): the personality brief for the system prompt. */
  brief: string
  voice: VoiceSettings
  emblem: EmblemTheme
}

export class PersonaError extends Error {
  override name = 'PersonaError'
}

/** Provisional until spike 0b records the measured model and format. */
export const DEFAULT_TTS_MODEL = 'eleven_flash_v2_5'
export const DEFAULT_OUTPUT_FORMAT: OutputFormat = 'pcm_24000'

export function sampleRateOf(format: OutputFormat): number {
  return Number(format.slice('pcm_'.length))
}

const unit = z.number().min(0).max(1)
const VoiceSchema = z.object({
  voiceId: z.string().min(1),
  modelId: z.string().min(1).default(DEFAULT_TTS_MODEL),
  outputFormat: z.enum(['pcm_24000', 'pcm_22050', 'pcm_16000']).default(DEFAULT_OUTPUT_FORMAT),
  stability: unit.default(0.6),
  similarityBoost: unit.default(0.75),
  style: unit.default(0.15)
})

// Colours land in CSS custom properties, so only plain hex is accepted.
const hex = z.string().regex(/^#[0-9a-fA-F]{3,8}$/)
const EmblemSchema = z.object({ core: hex, ring: hex, glow: hex, alert: hex })

const FrontmatterSchema = z.object({
  name: z.string().min(1),
  addressAs: z.string().min(1).default('Master')
})

function check<T>(schema: z.ZodType<T>, value: unknown, file: string): T {
  const r = schema.safeParse(value)
  if (r.success) return r.data
  const issue = r.error.issues[0]
  const field = issue.path.join('.') || '(root)'
  throw new PersonaError(`${file}: invalid field "${field}": ${issue.message}`)
}

async function readJson(dir: string, file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path.join(dir, file), 'utf8'))
  } catch (e) {
    throw new PersonaError(`${file}: cannot read (${(e as Error).message})`)
  }
}

/** Splits `---\nkey: value\n---\nbody` into a flat key/value map and the body. */
function splitFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!m) return { meta: {}, body: text.trim() }
  const meta: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line.trim())
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '')
  }
  return { meta, body: m[2].trim() }
}

export async function loadPersona(dir: string): Promise<Persona> {
  let text: string
  try {
    text = await readFile(path.join(dir, 'persona.md'), 'utf8')
  } catch (e) {
    throw new PersonaError(`persona.md: cannot read (${(e as Error).message})`)
  }
  const { meta, body } = splitFrontmatter(text)
  const front = check(FrontmatterSchema, meta, 'persona.md')
  const voice = check(VoiceSchema, await readJson(dir, 'voice.json'), 'voice.json')
  const emblem = check(EmblemSchema, await readJson(dir, 'emblem.json'), 'emblem.json')
  return { name: front.name, addressAs: front.addressAs, brief: body, voice, emblem }
}
