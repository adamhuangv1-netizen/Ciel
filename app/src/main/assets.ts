import path from 'node:path'
import type { AvatarSource, Box } from '../shared/types'

export const ASSET_SCHEME = 'ciel-asset'
export const AVATAR_URL = 'ciel-asset://persona/avatar.vrm'
export const PORTRAIT_URL = 'ciel-asset://persona/portrait'

const CONTENT_TYPES: Record<string, string> = {
  '.vrm': 'model/gltf-binary',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
}

export interface AssetFiles {
  avatar: string | null
  portrait: string | null
}

/**
 * The overlay may load exactly two persona files, each by one fixed URL. Anything else, including
 * other files in the pack and traversal tricks, resolves to nothing.
 */
export function resolveAsset(url: string, files: AssetFiles): { path: string; contentType: string } | null {
  const file = url === AVATAR_URL ? files.avatar : url === PORTRAIT_URL ? files.portrait : null
  if (!file) return null
  const contentType = CONTENT_TYPES[path.extname(file).toLowerCase()]
  return contentType ? { path: file, contentType } : null
}

/** What the overlay shows instead of the emblem: the portrait if the pack has one, else the VRM model. */
export function avatarSource(p: {
  avatarPath: string | null
  portrait: { path: string; eyes: Box } | null
}): AvatarSource | null {
  if (p.portrait) return { kind: 'portrait', url: PORTRAIT_URL, eyes: p.portrait.eyes }
  if (p.avatarPath) return { kind: 'vrm', url: AVATAR_URL }
  return null
}
