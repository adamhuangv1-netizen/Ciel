import type { CSSProperties, JSX } from 'react'
import { DEFAULT_THEME, type EmblemState, type EmblemTheme } from '../../shared/types'
import './Emblem.css'

export interface EmblemProps {
  state: EmblemState
  /** Speech loudness 0..1; drives the glow while speaking. */
  level: number
  theme?: EmblemTheme
}

/** Hexagon vertices around the origin, flat side up. */
function hexPoints(r: number): [number, number][] {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
}

/**
 * Original placeholder emblem: three segmented rings around a faceted hexagonal core.
 * Task 2 swaps in the owner's chosen variant.
 */
export function Emblem({ state, level, theme = DEFAULT_THEME }: EmblemProps): JSX.Element {
  const l = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0))
  const style = {
    '--level': String(l),
    '--core': theme.core,
    '--ring': theme.ring,
    '--glow': theme.glow,
    '--alert': theme.alert
  } as CSSProperties
  const outer = hexPoints(30)
  const inner = hexPoints(14)

  return (
    <div
      className="emblem"
      data-testid="emblem"
      data-state={state}
      style={style}
      role="img"
      aria-label={`Ciel is ${state}`}
    >
      <svg viewBox="-100 -100 200 200" width="100%" height="100%">
        <g className="emblem__ring emblem__ring--outer">
          <circle r="88" pathLength="120" strokeDasharray="7 3" />
        </g>
        <g className="emblem__ring emblem__ring--mid">
          <circle r="70" pathLength="60" strokeDasharray="12 3 2 3" />
        </g>
        <g className="emblem__ring emblem__ring--inner">
          <circle r="52" pathLength="36" strokeDasharray="1 2" />
        </g>
        <g className="emblem__core">
          <polygon className="emblem__facet" points={outer.map((p) => p.join(',')).join(' ')} />
          {outer.map(([x, y], i) => (
            <line
              key={i}
              className="emblem__edge"
              x1={inner[i][0]}
              y1={inner[i][1]}
              x2={x}
              y2={y}
            />
          ))}
          <polygon className="emblem__heart" points={inner.map((p) => p.join(',')).join(' ')} />
        </g>
      </svg>
    </div>
  )
}
