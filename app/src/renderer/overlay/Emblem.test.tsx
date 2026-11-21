// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Emblem } from './Emblem'

afterEach(cleanup)

describe('Emblem', () => {
  it('exposes its state as data-state', () => {
    render(<Emblem state="thinking" level={0} />)
    expect(screen.getByTestId('emblem').getAttribute('data-state')).toBe('thinking')
  })

  it('drives the --level CSS variable from the level prop', () => {
    render(<Emblem state="speaking" level={0.5} />)
    expect(screen.getByTestId('emblem').style.getPropertyValue('--level')).toBe('0.5')
  })

  it('clamps level into 0..1', () => {
    render(<Emblem state="speaking" level={3} />)
    expect(screen.getByTestId('emblem').style.getPropertyValue('--level')).toBe('1')
  })
})
