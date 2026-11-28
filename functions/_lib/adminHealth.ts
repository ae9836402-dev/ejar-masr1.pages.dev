import type { Env } from './env'
import { idKeyOk } from './idcrypto'
import { indexNowKey } from './indexnow'

export interface Health { ai: boolean; aiProvider: string | null; cron: boolean; idEncryption: boolean; indexNow: boolean; paymob: boolean; cloudinary: boolean; email: boolean; siteUrl: boolean }
const has = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0

/** Booleans only (is it set?), so the admin screen can say what is missing without ever showing a secret. */
export function healthOf(env: Env): Health {
  const gem = has(env.GEMINI_API_KEY), ant = has(env.ANTHROPIC_API_KEY)
  const provider = env.AI_PROVIDER === 'anthropic' && ant ? 'anthropic' : gem ? 'gemini' : ant ? 'anthropic' : null
  return {
    ai: gem || ant, aiProvider: provider, cron: has(env.CRON_SECRET), idEncryption: idKeyOk(env), indexNow: !!indexNowKey(env),
    paymob: has(env.PAYMOB_SECRET_KEY) && has(env.PAYMOB_PUBLIC_KEY) && has(env.PAYMOB_HMAC_SECRET) && has(env.PAYMOB_INTEGRATION_IDS),
    cloudinary: has(env.CLOUDINARY_CLOUD_NAME) && has(env.CLOUDINARY_API_KEY) && has(env.CLOUDINARY_API_SECRET), email: has(env.RESEND_API_KEY), siteUrl: has(env.SITE_URL),
  }
}
