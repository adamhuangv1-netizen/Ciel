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
