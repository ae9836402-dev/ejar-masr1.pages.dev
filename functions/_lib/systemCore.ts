/**
 * Settings the admin changes from the panel (settings/system) instead of Cloudflare variables: AI model names, thinking level, time limit, IndexNow key.
 * (Pure part: no network, so the admin page can import it too.)
 * A value set in the panel WINS over the Cloudflare variable of the same name; empty = use Cloudflare's (or the built-in default).
 * Secrets (API keys, CRON_SECRET, ID_ENC_KEY, payment keys) are deliberately NOT here: anyone who got into an admin account could read them.
 */
import type { Env } from './env'

export interface SystemSettings { aiModel: string; aiFallbackModel: string; aiResearchModel: string; aiThinking: string; aiTimeoutSeconds: number; indexNowKey: string }
export const EMPTY_SYSTEM: SystemSettings = { aiModel: '', aiFallbackModel: '', aiResearchModel: '', aiThinking: '', aiTimeoutSeconds: 0, indexNowKey: '' }

const MODEL = /^[A-Za-z0-9._:-]{1,80}$/
const model = (v: unknown): string => (typeof v === 'string' && MODEL.test(v.trim()) ? v.trim() : '')
const THINK = /^(minimal|low|medium|high|\d{1,5})$/

export function normalizeSystem(raw: unknown): SystemSettings {
  const o = (raw ?? {}) as Record<string, unknown>
  const t = String(o.aiThinking ?? '').trim().toLowerCase()
  const n = Math.round(Number(o.aiTimeoutSeconds))
  const key = typeof o.indexNowKey === 'string' ? o.indexNowKey.trim() : ''
  return {
    aiModel: model(o.aiModel), aiFallbackModel: model(o.aiFallbackModel), aiResearchModel: model(o.aiResearchModel),
    aiThinking: THINK.test(t) ? t : '', aiTimeoutSeconds: Number.isFinite(n) && n >= 20 && n <= 280 ? n : 0,
    indexNowKey: /^[A-Za-z0-9-]{8,128}$/.test(key) ? key : '',
  }
}

/** The environment with the panel's values laid over it. */
export function applySystem(env: Env, s: SystemSettings): Env {
  const out = { ...env } as Env
  if (s.aiModel) out.AI_MODEL = s.aiModel
  if (s.aiFallbackModel) out.AI_FALLBACK_MODEL = s.aiFallbackModel
  if (s.aiResearchModel) out.AI_RESEARCH_MODEL = s.aiResearchModel
  if (s.aiThinking) out.AI_THINKING = s.aiThinking
  if (s.aiTimeoutSeconds) out.AI_TIMEOUT_SECONDS = String(s.aiTimeoutSeconds)
  if (s.indexNowKey) out.INDEXNOW_KEY = s.indexNowKey
  return out
}

