import { doc, getDoc } from 'firebase/firestore'
import { DEFAULT_PROMO, normalizePromo, type PromoSettings } from '../../functions/_lib/promoCore'
import { db } from './firebase'

let cached: { at: number; value: PromoSettings } | null = null
/** Prices, plans and payment numbers (settings/promo is public-read, admin-write). Any failure just returns the defaults. */
export async function loadPromoSettings(force = false): Promise<PromoSettings> {
  if (!force && cached && Date.now() - cached.at < 60_000) return cached.value
  const value = await getDoc(doc(db, 'settings', 'promo')).then((s) => normalizePromo(s.exists() ? s.data() : undefined)).catch(() => DEFAULT_PROMO)
  cached = { at: Date.now(), value }
  return value
}
export const resetPromoSettings = (): void => { cached = null }
