import { describe, it, expect } from 'vitest'
import { resolveAsset, avatarSource, AVATAR_URL, PORTRAIT_URL } from './assets'

const AVATAR = 'C:\\Users\\me\\personas\\ciel\\avatar.vrm'
const PORTRAIT = 'C:\\Users\\me\\personas\\ciel\\ciel.png'
const EYES = { x: 0.35, y: 0.25, w: 0.3, h: 0.1 }

describe('resolveAsset', () => {
  it('maps the avatar URL to the VRM file, served as binary glTF', () => {
    expect(AVATAR_URL).toBe('ciel-asset://persona/avatar.vrm')
    expect(resolveAsset(AVATAR_URL, { avatar: AVATAR, portrait: null })).toEqual({
      path: AVATAR,
      contentType: 'model/gltf-binary'
    })
  })

  it('maps the portrait URL to the picture, with its image type', () => {
    expect(PORTRAIT_URL).toBe('ciel-asset://persona/portrait')
    expect(resolveAsset(PORTRAIT_URL, { avatar: null, portrait: PORTRAIT })).toEqual({
      path: PORTRAIT,
      contentType: 'image/png'
    })
    expect(resolveAsset(PORTRAIT_URL, { avatar: null, portrait: 'x\\ciel.webp' })?.contentType).toBe('image/webp')
    expect(resolveAsset(PORTRAIT_URL, { avatar: null, portrait: 'x\\ciel.jpg' })?.contentType).toBe('image/jpeg')
  })

  it('serves nothing the persona does not have', () => {
    expect(resolveAsset(AVATAR_URL, { avatar: null, portrait: PORTRAIT })).toBeNull()
    expect(resolveAsset(PORTRAIT_URL, { avatar: AVATAR, portrait: null })).toBeNull()
  })

  it('refuses any other path, including traversal attempts', () => {
    for (const url of [
      'ciel-asset://persona/persona.md',
      'ciel-asset://persona/ciel.png',
      'ciel-asset://persona/../../secrets.json',
      'ciel-asset://persona/%2e%2e/voice.json',
      'ciel-asset://other/avatar.vrm',
      'https://persona/avatar.vrm'
    ]) {
      expect(resolveAsset(url, { avatar: AVATAR, portrait: PORTRAIT })).toBeNull()
    }
  })
})

describe('avatarSource', () => {
  it('prefers the portrait picture over a VRM model', () => {
    expect(avatarSource({ avatarPath: AVATAR, portrait: { path: PORTRAIT, eyes: EYES } })).toEqual({
      kind: 'portrait',
      url: PORTRAIT_URL,
      eyes: EYES
    })
  })

  it('uses the VRM model when there is no picture', () => {
    expect(avatarSource({ avatarPath: AVATAR, portrait: null })).toEqual({ kind: 'vrm', url: AVATAR_URL })
  })

  it('has nothing to show without either, so the emblem stays', () => {
    expect(avatarSource({ avatarPath: null, portrait: null })).toBeNull()
  })
})
