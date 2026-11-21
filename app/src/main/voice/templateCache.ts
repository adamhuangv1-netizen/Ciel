import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Fixed notice phrases: rendered once per voice, then played from disk without spending characters. */
export const TEMPLATE_PHRASES: readonly string[] = [
  'Notice. Download complete.',
  'Notice. Process finished.',
  'Notice. Disk space is low.',
  'Notice. An application crashed.'
]

export class TemplateCache {
  private readonly dir: string
  private readonly voiceId: string
  private readonly modelId: string

  constructor(opts: { dir: string; voiceId: string; modelId: string }) {
    this.dir = opts.dir
    this.voiceId = opts.voiceId
    this.modelId = opts.modelId
  }

  async get(text: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.fileFor(text)))
    } catch {
      return null
    }
  }

  async put(text: string, bytes: Uint8Array): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.fileFor(text), bytes)
  }

  private fileFor(text: string): string {
    const key = createHash('sha256').update(`${this.voiceId}|${this.modelId}|${text}`).digest('hex')
    return path.join(this.dir, `${key}.pcm`)
  }
}
