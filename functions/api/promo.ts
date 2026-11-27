import type { Env } from '../_lib/env'
import { ConflictError, commit, commitGuarded, getDocument, runQuery, type Write } from '../_lib/firestore'
import { HttpError, errorResponse, json, readJson, requireUser } from '../_lib/http'
import { isExpiredDate } from '../_lib/logic'
import { activePlan, extendUntil, loadPromo, parseRequest } from '../_lib/promo'

const MAX_PENDING = 5
const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : null)
const newId = (): string => crypto.randomUUID().replace(/-/g, '').slice(0, 20)

/** The same bank/wallet transfer must not pay for two requests: one document per (method, reference), created in the same commit as the request. */
async function refKey(method: string, reference: string): Promise<string> {
  const norm = reference.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${method}:${norm}`))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40)
}

const shape = (id: string, d: Record<string, unknown>) => ({
  id, uid: d.uid, userName: d.userName, userEmail: d.userEmail, kind: d.kind, unitId: d.unitId ?? null, unitTitle: d.unitTitle ?? '', scope: d.scope ?? null,
  planId: d.planId ?? null, planName: d.planName ?? '', days: d.days, amount: d.amount, method: d.method, reference: d.reference,
  status: d.status, note: d.note ?? '', createdAt: iso(d.createdAt), decidedAt: iso(d.decidedAt),
})

/**
 * POST /api/promo
 *   user:  { action: 'request', kind: 'featured', unitId, scope: 'gov'|'all', method, reference }
 *          { action: 'request', kind: 'plan', planId, method, reference }
 *   admin: { action: 'list' } | { action: 'approve', id, note? } | { action: 'reject', id, note? }
 * Prices and durations are taken from settings/promo on the server; the browser only says WHAT it wants and which transfer it made.
 * A request changes nothing visible. Only an admin's approval does (featured period on the ad, or the plan on the account).
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env)
    const body = await readJson<Record<string, unknown>>(request)

    if (body.action === 'request') {
      const promo = await loadPromo(env)
      if (!promo.enabled) throw new HttpError(503, 'promo-off', 'الدفع للإعلانات المميزة والباقات متوقف مؤقتًا')
      if (!promo.vodafoneCash && !promo.instapay) throw new HttpError(503, 'promo-not-configured', 'الدفع لسه مش متفعّل. جرّب بعد شوية')
      const parsed = parseRequest(body)
      if (typeof parsed === 'string') throw new HttpError(400, 'bad-request', parsed)
      if (parsed.method === 'vodafone' ? !promo.vodafoneCash : !promo.instapay) throw new HttpError(400, 'method-off', 'طريقة الدفع دي مش متاحة حاليًا')

      const mine = await runQuery(env, { collection: 'promoRequests', where: [{ field: 'uid', op: 'EQUAL', value: user.uid }], limit: 60 })
      if (mine.filter((r) => r.data.status === 'pending').length >= MAX_PENDING) throw new HttpError(429, 'too-many', 'عندك طلبات كتير لسه تحت المراجعة. استنى لما تتراجع')

      const base: Record<string, unknown> = { uid: user.uid, userName: String(user.data.displayName ?? ''), userEmail: String(user.data.email ?? ''), kind: parsed.kind, method: parsed.method, reference: parsed.reference, status: 'pending', createdAt: new Date() }
      if (parsed.kind === 'featured') {
        if (!promo.featured.enabled) throw new HttpError(400, 'featured-off', 'الإعلانات المميزة متوقفة حاليًا')
        const unit = await getDocument(env, `units/${parsed.unitId}`)
        if (!unit || unit.data.ownerId !== user.uid) throw new HttpError(404, 'not-found', 'الإعلان غير موجود في حسابك')
        if (unit.data.status !== 'active' || isExpiredDate(unit.data.expiresAt)) throw new HttpError(400, 'not-active', 'الإعلان لازم يكون منشور وساري عشان تميّزه')
        Object.assign(base, { unitId: parsed.unitId, unitTitle: String(unit.data.title ?? '').slice(0, 120), scope: parsed.scope, days: promo.featured.days, amount: parsed.scope === 'all' ? promo.featured.priceAll : promo.featured.priceGov })
      } else {
        const plan = promo.plans.find((p) => p.id === parsed.planId)
        if (!plan) throw new HttpError(404, 'no-plan', 'الباقة غير موجودة')
        Object.assign(base, { planId: plan.id, planName: plan.name, days: plan.days, amount: plan.price, planRevealLimit: plan.revealLimit, planMaxAds: plan.maxAds })
      }

      const key = await refKey(parsed.method, parsed.reference)
      const id = newId()
      try {
        await commit(env, [{ kind: 'create', path: `promoRefs/${key}`, data: { requestId: id, uid: user.uid, at: new Date() } }, { kind: 'create', path: `promoRequests/${id}`, data: { ...base, refKey: key } }])
      } catch (e) {
        if (e instanceof ConflictError) throw new HttpError(409, 'ref-used', 'رقم العملية ده اتسجّل قبل كده في طلب تاني')
        throw e
      }
      return json({ id, amount: base.amount, status: 'pending' })
    }

    // ---------- admin ----------
    if (!user.isAdmin) throw new HttpError(403, 'forbidden', 'مش مسموح')

    if (body.action === 'list') {
      const rows = await runQuery(env, { collection: 'promoRequests', orderBy: { field: 'createdAt', dir: 'DESCENDING' }, limit: 100 })
      return json({ requests: rows.map((r) => shape(r.id, r.data)) })
    }

    if (body.action === 'approve' || body.action === 'reject') {
      const id = typeof body.id === 'string' && /^[A-Za-z0-9]{10,40}$/.test(body.id) ? body.id : ''
      if (!id) throw new HttpError(400, 'bad-id', 'رقم الطلب غير صحيح')
      const note = typeof body.note === 'string' ? body.note.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 300) : ''
      const req = await getDocument(env, `promoRequests/${id}`)
      if (!req) throw new HttpError(404, 'not-found', 'الطلب غير موجود')
      if (req.data.status !== 'pending') throw new HttpError(409, 'decided', 'الطلب ده اتراجع قبل كده')
      const now = new Date()
      const d = req.data
      const mark: Write = { kind: 'upsert', path: `promoRequests/${id}`, data: { status: body.action === 'approve' ? 'approved' : 'rejected', decidedAt: now, decidedBy: user.uid, note } }

      if (body.action === 'reject') {
        // The transfer reference is freed so the person can fix a typo and send it again.
        const writes: Write[] = [mark]
        if (typeof d.refKey === 'string' && d.refKey) writes.push({ kind: 'delete', path: `promoRefs/${d.refKey}` })
        await commitGuarded(env, writes, { [`promoRequests/${id}`]: req.updateTime })
        return json({ ok: true, status: 'rejected' })
      }

      const days = Math.max(1, Number(d.days) || 1)
      const writes: Write[] = [mark]
      let result: Record<string, unknown> = {}
      if (d.kind === 'featured') {
        const unitId = String(d.unitId ?? '')
        const unit = await getDocument(env, `units/${unitId}`)
        if (!unit) throw new HttpError(404, 'unit-gone', 'الإعلان اتحذف. ارفض الطلب')
        const current = unit.data.featuredUntil instanceof Date && unit.data.featuredUntil.getTime() > now.getTime() ? unit.data.featuredUntil : null
        const until = extendUntil(current, days, now)
        // Keep the wider placement if the ad already has a running "all Egypt" period.
        const scope = current && unit.data.featuredScope === 'all' ? 'all' : d.scope === 'all' ? 'all' : 'gov'
        writes.push({ kind: 'upsert', path: `units/${unitId}`, data: { featuredUntil: until, featuredScope: scope } })
        result = { featuredUntil: until.toISOString(), scope }
      } else if (d.kind === 'plan') {
        const uid = String(d.uid ?? '')
        const owner = await getDocument(env, `users/${uid}`)
        if (!owner) throw new HttpError(404, 'user-gone', 'الحساب اتحذف. ارفض الطلب')
        const cur = activePlan(owner.data, now)
        const until = extendUntil(cur && cur.id === d.planId ? cur.until : null, days, now)
        const plan = { id: String(d.planId ?? ''), name: String(d.planName ?? ''), until, revealLimit: Math.max(1, Number(d.planRevealLimit) || 1), maxAds: Math.max(0, Number(d.planMaxAds) || 0) }
        writes.push({ kind: 'upsert', path: `users/${uid}`, data: { plan } })
        // The "verified" badge on the member's ads follows the plan period (the page checks the date, so expiry needs no job).
        const units = await runQuery(env, { collection: 'units', where: [{ field: 'ownerId', op: 'EQUAL', value: uid }], limit: 300 })
        for (const u of units) writes.push({ kind: 'upsert', path: `units/${u.id}`, data: { ownerPlanUntil: until } })
        result = { planUntil: until.toISOString(), adsUpdated: units.length }
      } else throw new HttpError(400, 'bad-kind', 'نوع الطلب غير معروف')
      await commitGuarded(env, writes, { [`promoRequests/${id}`]: req.updateTime })
      return json({ ok: true, status: 'approved', ...result })
    }

    throw new HttpError(400, 'bad-action', 'إجراء غير معروف')
  } catch (e) { return errorResponse(e) }
}
