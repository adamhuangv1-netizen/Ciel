/** Reloading a crashed overlay is limited so a page that crashes on load can't spin forever. */
const MAX_RELOADS = 3
const WINDOW_MS = 60_000

/** Returns a check that says whether another reload is allowed at `nowMs`, and records it if so. */
export function createReloadPolicy(): (nowMs: number) => boolean {
  const recent: number[] = []
  return (nowMs) => {
    while (recent.length > 0 && nowMs - recent[0]! >= WINDOW_MS) recent.shift()
    if (recent.length >= MAX_RELOADS) return false
    recent.push(nowMs)
    return true
  }
}
