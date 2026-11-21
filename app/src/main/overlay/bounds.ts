export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The overlay covers the primary display's whole work area (screen minus taskbar),
 * in Electron's DIP coordinates, so cards anchored bottom-right never sit under the taskbar.
 */
export function overlayBounds(workArea: Rect): Rect {
  return { x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height }
}

/** The preferred monitor if it is still connected, else the primary. */
export function pickDisplay<T extends { id: number }>(
  displays: T[],
  preferredId: number | null,
  primary: T
): T {
  return displays.find((d) => d.id === preferredId) ?? primary
}

export function displayLabel(
  d: { id: number; size: { width: number; height: number } },
  index: number,
  primaryId: number
): string {
  const base = `Display ${index + 1} · ${d.size.width}×${d.size.height}`
  return d.id === primaryId ? `${base} (main)` : base
}
