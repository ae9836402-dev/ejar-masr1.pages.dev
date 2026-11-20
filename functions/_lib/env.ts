import { DEFAULT_SITE_URL } from '../../src/lib/brand'

export interface Env {
  ASSETS: Fetcher
  FIREBASE_PROJECT_ID: string
  FIREBASE_SERVICE_ACCOUNT: string
  CLOUDINARY_CLOUD_NAME: string
  CLOUDINARY_API_KEY: string
  CLOUDINARY_API_SECRET: string
  SITE_URL?: string
  PAYMOB_SECRET_KEY?: string
  PAYMOB_PUBLIC_KEY?: string
  PAYMOB_INTEGRATION_IDS?: string // comma-separated card/wallet integration ids
  PAYMOB_HMAC_SECRET?: string
  CRON_SECRET?: string // protects POST /api/sweep (daily job)
  RESEND_API_KEY?: string // transactional email (resend.com free tier)
  EMAIL_FROM?: string // e.g. "إيجار مصر <noreply@your-domain.com>"
  ANTHROPIC_API_KEY?: string // article writer (Claude): best Arabic quality, pay per use
  GEMINI_API_KEY?: string // article writer (Google Gemini): has a free tier
  AI_PROVIDER?: string // 'anthropic' | 'gemini' (default: whichever key is set, Gemini first)
  AI_MODEL?: string // optional model override
}
export const siteUrl = (env: Env): string => env.SITE_URL ?? DEFAULT_SITE_URL
