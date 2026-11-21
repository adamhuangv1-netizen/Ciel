import type { Box, EmblemState } from '../../../shared/types'
import type { Framing } from '../avatar/avatarLogic'
import { containRect, createGlitcher, sourceRect, type Rect } from './portraitLogic'

export interface PortraitScene {
  /** Resolves once the picture is loaded; rejects if it can't be. */
  ready: Promise<void>
  setState(s: EmblemState): void
  setFraming(f: Framing): void
  dispose(): void
}

export interface PortraitColors {
  /** Glitch fragments and the colour split's first channel. */
  glow: string
  /** The colour split's second channel. */
  accent: string
}

interface Fragment {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  age: number
  life: number
}

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

/** True if any pixel of the picture is see-through (a cut-out), checked on a small copy. */
function hasTransparency(img: ImageBitmap): boolean {
  try {
    const [, g] = canvas2d(64, 64)
    g.drawImage(img, 0, 0, 64, 64)
    const d = g.getImageData(0, 0, 64, 64).data
    for (let i = 3; i < d.length; i += 4) if (d[i]! < 250) return true
  } catch {
    // Unreadable pixels: treat it as an opaque picture.
  }
  return false
}

/** A picture with a background gets soft edges so she doesn't sit in a hard rectangle. */
function featherEdges(img: ImageBitmap): HTMLCanvasElement {
  const [c, g] = canvas2d(img.width, img.height)
  const { width: w, height: h } = c
  g.drawImage(img, 0, 0)
  g.globalCompositeOperation = 'destination-in'
  const across = g.createLinearGradient(0, 0, w, 0)
  across.addColorStop(0, 'rgba(0,0,0,0)')
  across.addColorStop(0.08, 'rgba(0,0,0,1)')
  across.addColorStop(0.92, 'rgba(0,0,0,1)')
  across.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = across
  g.fillRect(0, 0, w, h)
  const down = g.createLinearGradient(0, 0, 0, h)
  down.addColorStop(0, 'rgba(0,0,0,0)')
  down.addColorStop(0.06, 'rgba(0,0,0,1)')
  down.addColorStop(0.78, 'rgba(0,0,0,1)')
  down.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = down
  g.fillRect(0, 0, w, h)
  return c
}

/** The picture's shape filled with one colour, for the glitch's colour split. */
function tinted(src: CanvasImageSource, w: number, h: number, color: string): HTMLCanvasElement {
  const [c, g] = canvas2d(w, h)
  g.drawImage(src, 0, 0)
  g.globalCompositeOperation = 'source-atop'
  g.fillStyle = color
  g.fillRect(0, 0, w, h)
  return c
}

const hash = (n: number): number => {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}

/**
 * Draws the persona's 2D portrait: the whole picture (breathing gently) or a crop of her eyes, with
 * a brief glitch every few seconds — sliced bands, a colour split and fragments drifting off.
 */
export function createPortraitScene(
  canvas: HTMLCanvasElement,
  url: string,
  eyes: Box,
  colors: PortraitColors
): PortraitScene {
  const ctx = canvas.getContext('2d')!

  let framing: Framing = 'full'
  let state: EmblemState = 'idle'
  let picture: CanvasImageSource | null = null
  let tints: [HTMLCanvasElement, HTMLCanvasElement] | null = null
  let size = { w: 1, h: 1 }
  let src: Rect | null = null
  const glitch = createGlitcher()
  const fragments: Fragment[] = []
  let last = performance.now()
  const started = last
  let frame = 0
  let burstSpawned = -1

  // fetch + createImageBitmap: the same ciel-asset:// path the VRM loader uses, and the pixels stay
  // readable for the transparency check.
  const ready = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`portrait: HTTP ${r.status}`)
      return r.blob()
    })
    .then((blob) => createImageBitmap(blob))
    .then((img) => {
      size = { w: img.width, h: img.height }
      const pic = hasTransparency(img) ? img : featherEdges(img)
      picture = pic
      tints = [tinted(pic, size.w, size.h, colors.glow), tinted(pic, size.w, size.h, colors.accent)]
    })

  const spawn = (dest: Rect, n: number): void => {
    for (let i = 0; i < n; i++) {
      const left = Math.random() < 0.5
      fragments.push({
        x: dest.x + dest.w * (left ? 0.12 + Math.random() * 0.12 : 0.76 + Math.random() * 0.12),
        y: dest.y + dest.h * (0.15 + Math.random() * 0.6),
        vx: (left ? -1 : 1) * (15 + Math.random() * 45),
        vy: -(5 + Math.random() * 25),
        size: 2 + Math.random() * 4,
        age: 0,
        life: 0.4 + Math.random() * 0.8
      })
    }
  }

  const tick = (): void => {
    frame = requestAnimationFrame(tick)
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    const t = (now - started) / 1000

    const dpr = window.devicePixelRatio || 1
    const vw = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const vh = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw
      canvas.height = vh
    }
    ctx.clearRect(0, 0, vw, vh)
    if (!picture || !tints) return

    // Ease between the full picture and the eyes crop.
    const target = sourceRect(framing, eyes, size, vw / vh)
    const k = src ? 1 - Math.pow(0.001, dt) : 1
    src = src ?? target
    src = {
      x: src.x + (target.x - src.x) * k,
      y: src.y + (target.y - src.y) * k,
      w: src.w + (target.w - src.w) * k,
      h: src.h + (target.h - src.h) * k
    }
    let dest = containRect(src, { w: vw, h: vh })
    if (framing === 'full') {
      // Slow breathing, scaled from the bottom edge so she rises and settles.
      const s = 1 + 0.006 * Math.sin(t * 1.4) * (state === 'thinking' ? 0.5 : 1)
      dest = {
        x: dest.x - (dest.w * (s - 1)) / 2,
        y: dest.y - dest.h * (s - 1),
        w: dest.w * s,
        h: dest.h * s
      }
    }
    ctx.drawImage(picture, src.x, src.y, src.w, src.h, dest.x, dest.y, dest.w, dest.h)

    const g = glitch(t)
    if (g.strength > 0) {
      const amp = (framing === 'eyes' ? 0.012 : 0.03) * g.strength
      // Colour split: faint offset copies in the glow and accent colours.
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.22 * g.strength
      ctx.drawImage(
        tints[0],
        src.x,
        src.y,
        src.w,
        src.h,
        dest.x + amp * dest.w,
        dest.y,
        dest.w,
        dest.h
      )
      ctx.drawImage(
        tints[1],
        src.x,
        src.y,
        src.w,
        src.h,
        dest.x - amp * dest.w,
        dest.y,
        dest.w,
        dest.h
      )
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      // Sliced bands: a few horizontal strips jump sideways.
      const bands = 16
      for (let i = 0; i < bands; i++) {
        if (hash(g.seed * 97 + i) < 0.7) continue
        const shift = (hash(g.seed * 31 + i) - 0.5) * 2 * amp * 2.5 * dest.w
        const sy = src.y + (src.h * i) / bands
        const dy = dest.y + (dest.h * i) / bands
        ctx.clearRect(0, dy, vw, dest.h / bands)
        ctx.drawImage(
          picture,
          src.x,
          sy,
          src.w,
          src.h / bands,
          dest.x + shift,
          dy,
          dest.w,
          dest.h / bands
        )
      }
      if (g.seed !== burstSpawned && framing === 'full')
        spawn(dest, 8 + Math.floor(g.strength * 10))
      burstSpawned = g.seed
    }

    // Fragments drift outward in small steps, flicker and fade.
    ctx.fillStyle = colors.glow
    for (let i = fragments.length - 1; i >= 0; i--) {
      const f = fragments[i]!
      f.age += dt
      if (f.age >= f.life) {
        fragments.splice(i, 1)
        continue
      }
      const step = Math.floor(f.age / 0.06) * 0.06
      const on = Math.sin(f.age * 37 + i) > -0.5 ? 1 : 0.25
      ctx.globalAlpha = (1 - f.age / f.life) * on * 0.9
      ctx.fillRect(f.x + f.vx * step * dpr, f.y + f.vy * step * dpr, f.size * dpr, f.size * dpr)
    }
    ctx.globalAlpha = 1
  }
  tick()

  return {
    ready,
    setState: (s) => {
      state = s
    },
    setFraming: (f) => {
      framing = f
    },
    dispose: () => cancelAnimationFrame(frame)
  }
}
