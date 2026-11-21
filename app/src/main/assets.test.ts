import { describe, it, expect } from 'vitest'
import { resolveAsset, AVATAR_URL } from './assets'

const AVATAR = 'C:\\Users\\me\\personas\\ciel\\avatar.vrm'

describe('resolveAsset', () => {
  it('maps the avatar URL to the persona avatar file', () => {
    expect(AVATAR_URL).toBe('ciel-asset://persona/avatar.vrm')
    expect(resolveAsset(AVATAR_URL, AVATAR)).toBe(AVATAR)
  })

  it('serves nothing when the persona has no avatar', () => {
    expect(resolveAsset(AVATAR_URL, null)).toBeNull()
  })

  it('refuses any other path, including traversal attempts', () => {
    for (const url of [
      'ciel-asset://persona/persona.md',
      'ciel-asset://persona/../../secrets.json',
      'ciel-asset://persona/%2e%2e/voice.json',
      'ciel-asset://other/avatar.vrm',
      'https://persona/avatar.vrm'
    ]) {
      expect(resolveAsset(url, AVATAR)).toBeNull()
    }
  })
})
