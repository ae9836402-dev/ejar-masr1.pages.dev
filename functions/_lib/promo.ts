/** Server-side loader for the promo settings; everything pure lives in promoCore.ts (shared with the browser). */
import type { Env } from './env'
import { getDocument } from './firestore'
import { normalizePromo, type PromoSettings } from './promoCore'

export * from './promoCore'

let cache: { at: number; value: PromoSettings } | null = null
export async function loadPromo(env: Env): Promise<PromoSettings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value
  const doc = await getDocument(env, 'settings/promo')
  const value = normalizePromo(doc?.data)
  cache = { at: Date.now(), value }
  return value
}
export const resetPromoCache = (): void => { cache = null }

