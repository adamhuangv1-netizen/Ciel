const ABBREVIATIONS = new Set(['e.g', 'i.e', 'etc', 'vs', 'dr', 'mr', 'ms', 'mrs'])

/** Index just past the first sentence terminator in `buf` that is followed by whitespace, or -1. */
function findBoundary(buf: string): number {
  for (let i = 0; i < buf.length - 1; i++) {
    const c = buf[i]
    if (c !== '.' && c !== '!' && c !== '?') continue
    if (!/\s/.test(buf[i + 1])) continue
    if (c === '.') {
      if (buf[i - 1] === '.') continue // end of an ellipsis
      const token = buf.slice(0, i).split(/\s/).pop() ?? ''
      if (ABBREVIATIONS.has(token.toLowerCase())) continue
    }
    return i + 1
  }
  return -1
}

export function createSentenceSplitter(onSentence: (s: string) => void): {
  push(delta: string): void
  flush(): void
} {
  let buf = ''
  return {
    push(delta: string): void {
      buf += delta
      let cut = findBoundary(buf)
      while (cut !== -1) {
        const sentence = buf.slice(0, cut).trim()
        if (sentence) onSentence(sentence)
        buf = buf.slice(cut)
        cut = findBoundary(buf)
      }
    },
    flush(): void {
      const rest = buf.trim()
      buf = ''
      if (rest) onSentence(rest)
    }
  }
}

export function speakableLead(text: string, maxSentences = 3, maxChars = 300): string {
  const sentences: string[] = []
  const splitter = createSentenceSplitter((s) => sentences.push(s))
  splitter.push(text)
  splitter.flush()
  const lead = sentences.slice(0, maxSentences).join(' ')
  if (lead.length <= maxChars) return lead
  const room = lead.slice(0, maxChars) // leaves 1 char for the ellipsis after trimming
  const lastSpace = room.lastIndexOf(' ')
  const body = lastSpace > 0 ? room.slice(0, lastSpace) : room.slice(0, maxChars - 1)
  return body + '…'
}
