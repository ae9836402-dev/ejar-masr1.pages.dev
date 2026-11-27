/**
 * (Pure part: no network, no Firestore, so the browser can import it too.)
 * Paid promotion without a payment gateway: featured ads and broker plans.
 * The owner/broker pays by Vodafone Cash or InstaPay, sends us the transfer reference, and an admin approves it. Nothing here moves money:
 * prices come from `settings/promo` (admin-edited), a request only records "I paid X, reference Y", and approval is a human decision.
 */

export interface Plan { id: string; name: string; price: number; days: number; revealLimit: number; /** 0 = unlimited */ maxAds: number }
export interface PromoSettings {
  /** Master switch for ALL paid promotion (featured ads and plans). Off = the plans page shows "closed" and new requests are refused; what was already approved keeps running. */
  enabled: boolean
  vodafoneCash: string; instapay: string; payeeName: string
  featured: { enabled: boolean; days: number; priceGov: number; priceAll: number }
  plans: Plan[]
  /** Active ads allowed without a plan. 0 = unlimited. */
  freeMaxAds: { owner: number; broker: number }
}

export const DEFAULT_PROMO: PromoSettings = {
  enabled: true,
  vodafoneCash: '', instapay: '', payeeName: '',
  featured: { enabled: true, days: 7, priceGov: 100, priceAll: 250 },
  plans: [
    { id: 'broker-basic', name: 'سمسار أساسي', price: 300, days: 30, revealLimit: 60, maxAds: 30 },
    { id: 'broker-pro', name: 'سمسار محترف', price: 700, days: 30, revealLimit: 200, maxAds: 100 },
  ],
  freeMaxAds: { owner: 0, broker: 5 },
}

export const METHODS = ['vodafone', 'instapay'] as const
export type Method = (typeof METHODS)[number]
export const SCOPES = ['gov', 'all'] as const
export type Scope = (typeof SCOPES)[number]

const num = (v: unknown, min: number, max: number, d: number): number => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d }
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '')
const PLAN_ID = /^[a-z0-9-]{2,30}$/

/** Whatever is stored (or nothing) -> a complete, bounded settings object. */
export function normalizePromo(raw: unknown): PromoSettings {
  const o = (raw ?? {}) as Record<string, unknown>
  const f = (o.featured ?? {}) as Record<string, unknown>
  const free = (o.freeMaxAds ?? {}) as Record<string, unknown>
  const seen = new Set<string>()
  const plans = (Array.isArray(o.plans) ? o.plans : DEFAULT_PROMO.plans).flatMap((p): Plan[] => {
    const x = (p ?? {}) as Record<string, unknown>
    const id = str(x.id, 30)
    if (!PLAN_ID.test(id) || seen.has(id)) return []
    seen.add(id)
    return [{ id, name: str(x.name, 40) || id, price: num(x.price, 1, 1_000_000, 300), days: num(x.days, 1, 366, 30), revealLimit: num(x.revealLimit, 1, 100_000, 60), maxAds: num(x.maxAds, 0, 100_000, 30) }]
  }).slice(0, 6)
  return {
    enabled: o.enabled !== false,
    vodafoneCash: str(o.vodafoneCash, 20), instapay: str(o.instapay, 60), payeeName: str(o.payeeName, 60),
    featured: { enabled: f.enabled !== false, days: num(f.days, 1, 90, DEFAULT_PROMO.featured.days), priceGov: num(f.priceGov, 1, 1_000_000, DEFAULT_PROMO.featured.priceGov), priceAll: num(f.priceAll, 1, 1_000_000, DEFAULT_PROMO.featured.priceAll) },
    plans,
    freeMaxAds: { owner: num(free.owner, 0, 100_000, DEFAULT_PROMO.freeMaxAds.owner), broker: num(free.broker, 0, 100_000, DEFAULT_PROMO.freeMaxAds.broker) },
  }
}

// ---------- plans on a user ----------
export interface ActivePlan { id: string; name: string; until: Date; revealLimit: number; maxAds: number }

/** The plan stored on the user's profile, if it has not expired. Limits are the ones stored at approval time, so later price/limit edits never shrink a plan someone already paid for. */
export function activePlan(user: Record<string, unknown> | null | undefined, now: Date = new Date()): ActivePlan | null {
  const p = user?.plan as Record<string, unknown> | undefined
  if (!p || !(p.until instanceof Date) || p.until.getTime() <= now.getTime()) return null
  return { id: String(p.id ?? ''), name: String(p.name ?? ''), until: p.until, revealLimit: Math.max(1, Number(p.revealLimit) || 1), maxAds: Math.max(0, Number(p.maxAds) || 0) }
}

/** Daily contact-reveal limit for a user: the plan's if active, otherwise `base`. */
export const revealLimitFor = (user: Record<string, unknown> | null | undefined, base: number, now: Date = new Date()): number => {
  const p = activePlan(user, now)
  return p ? Math.max(base, p.revealLimit) : base
}

/** Active ads allowed. 0 = unlimited. */
export function maxAdsFor(user: Record<string, unknown> | null | undefined, promo: PromoSettings, now: Date = new Date()): number {
  const p = activePlan(user, now)
  if (p) return p.maxAds
  return user?.accountType === 'broker' ? promo.freeMaxAds.broker : promo.freeMaxAds.owner
}

/** New expiry when a paid period is added: it starts when the previous one ends (nobody loses days by renewing early). */
export const extendUntil = (current: Date | null | undefined, days: number, now: Date = new Date()): Date => {
  const start = current instanceof Date && current.getTime() > now.getTime() ? current : now
  return new Date(start.getTime() + days * 86_400_000)
}

// ---------- featured ads ----------
type Wire = { __ts?: number }
const ts = (v: unknown): number | null => (v instanceof Date ? v.getTime() : v && typeof v === 'object' && typeof (v as Wire).__ts === 'number' ? (v as Wire).__ts! : null)

/** True while the paid period runs. `gov` placement counts only when the list is filtered to the unit's governorate; `all` counts everywhere. */
export function isFeaturedFor(unit: Record<string, unknown>, now: number, govFilter?: string): boolean {
  const until = ts(unit.featuredUntil)
  if (until === null || until <= now) return false
  return unit.featuredScope === 'all' || (!!govFilter && unit.governorateId === govFilter)
}

// ---------- requests ----------
export interface RequestInput { kind: 'featured' | 'plan'; unitId?: string; scope?: Scope; planId?: string; method: Method; reference: string }
export const REFERENCE = /^[\p{L}\p{N}\-_. #]{4,40}$/u

/** Validates the shape only; ownership, prices and duplicates are checked by the endpoint against stored data. */
export function parseRequest(b: Record<string, unknown>): RequestInput | string {
  const kind = b.kind === 'featured' || b.kind === 'plan' ? b.kind : null
  if (!kind) return 'نوع الطلب غير صحيح'
  const method = METHODS.find((m) => m === b.method)
  if (!method) return 'اختار طريقة الدفع (فودافون كاش أو إنستاباي)'
  const reference = typeof b.reference === 'string' ? b.reference.trim() : ''
  if (!REFERENCE.test(reference)) return 'اكتب رقم عملية التحويل أو رقم الموبايل اللي حوّلت منه (4 إلى 40 حرف)'
  if (kind === 'featured') {
    const scope = SCOPES.find((s) => s === b.scope)
    if (!scope) return 'اختار مكان الظهور'
    if (typeof b.unitId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(b.unitId)) return 'الإعلان غير صحيح'
    return { kind, unitId: b.unitId, scope, method, reference }
  }
  if (typeof b.planId !== 'string' || !PLAN_ID.test(b.planId)) return 'الباقة غير صحيحة'
  return { kind, planId: b.planId, method, reference }
}
