import type { Env } from './env'
import { getDocument } from './firestore'
import { EMPTY_SYSTEM, applySystem, normalizeSystem, type SystemSettings } from './systemCore'

export * from './systemCore'

let cache: { at: number; s: SystemSettings } | null = null
export const resetSystemCache = (): void => { cache = null }
export async function loadSystem(env: Env): Promise<SystemSettings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.s
  let s = EMPTY_SYSTEM
  try { s = normalizeSystem((await getDocument(env, 'settings/system'))?.data) } catch { /* a failed read must never take the AI or the key file down: fall back to Cloudflare's values */ }
  cache = { at: Date.now(), s }
  return s
}
/** Use at the top of every endpoint that calls the AI or serves the IndexNow key. */
export async function withPanelSettings(env: Env): Promise<Env> { return applySystem(env, await loadSystem(env)) }
