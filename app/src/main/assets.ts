/** The only URL the renderer may load from the persona pack: the VRM avatar. */
export const AVATAR_URL = 'ciel-asset://persona/avatar.vrm'
export const ASSET_SCHEME = 'ciel-asset'

/**
 * Maps a ciel-asset:// request to a file on disk, or null. Deliberately an exact-match allowlist:
 * nothing else in the persona pack (voice settings, personality brief) is reachable from the renderer.
 */
export function resolveAsset(url: string, avatarPath: string | null): string | null {
  if (!avatarPath) return null
  return url === AVATAR_URL ? avatarPath : null
}
