import type { Env } from '../_lib/env'
import { commit, commitGuarded, getDocument, runQuery, type Write } from '../_lib/firestore'
import { HttpError, errorResponse, json, readJson, requireUser } from '../_lib/http'
import { decryptJpegDataUrl, encryptJpegDataUrl, idKeyOk } from '../_lib/idcrypto'
import { idEnabled, parseSubmission } from '../_lib/idverify'

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : null)
const clip = (v: unknown, n: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n) : '')
const uidOf = (v: unknown): string => { if (typeof v !== 'string' || !/^[A-Za-z0-9]{6,128}$/.test(v)) throw new HttpError(400, 'bad-id', 'الحساب غير صحيح'); return v }
const shape = (id: string, d: Record<string, unknown>) => ({ uid: id, userName: d.userName, userEmail: d.userEmail, docType: d.docType, status: d.status, note: d.note ?? '', hasImages: d.hasImages === true, submittedAt: iso(d.submittedAt), decidedAt: iso(d.decidedAt), viewedAt: iso(d.viewedAt), viewedBy: d.viewedBy ?? null })

/** Copies the badge state onto the member's ads (the ads carry a copy so search needs no join). First 300 ads. */
async function badgeWrites(env: Env, uid: string, on: boolean): Promise<Write[]> {
  const units = await runQuery(env, { collection: 'units', where: [{ field: 'ownerId', op: 'EQUAL', value: uid }], limit: 300 })
  return units.map((u): Write => ({ kind: 'upsert', path: `units/${u.id}`, data: { ownerVerified: on } }))
}

/**
 * POST /api/id-verify
 *   member: { action: 'submit', docType: 'national_id'|'passport', front, back?, consent: true } | { action: 'cancel' } | { action: 'erase' } | { action: 'badge', show: boolean }
 *   admin:  { action: 'list' } | { action: 'find', email } | { action: 'view', uid } | { action: 'approve'|'reject'|'revoke', uid, note? } | { action: 'purge', uid }
 * The photos are encrypted at rest (_lib/idcrypto.ts) and readable only here. They are KEPT after a decision so an admin can open any member's ID at any time
 * (every opening is logged with the admin's id and time); they are deleted when an admin purges them, the member erases them, a pending request is cancelled,
 * or the optional retention period (settings/idVerification.retentionMonths) runs out.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env)
    const b = await readJson<Record<string, unknown>>(request)
    const me = user.uid

    if (b.action === 'submit') {
      if (!(await idEnabled(env))) throw new HttpError(503, 'id-off', 'توثيق الهوية متوقف مؤقتًا')
      if (!idKeyOk(env)) throw new HttpError(503, 'id-key', 'حفظ صور الهوية لسه مش متفعّل (مفتاح التشفير ناقص). كلّم الإدارة')
      const parsed = parseSubmission(b)
      if (typeof parsed === 'string') throw new HttpError(400, 'bad-request', parsed)
      const cur = await getDocument(env, `idVerifications/${me}`)
      if (cur?.data.status === 'pending') throw new HttpError(409, 'pending', 'طلبك تحت المراجعة بالفعل')
      if (cur?.data.status === 'approved' && user.data.verified === true) throw new HttpError(409, 'approved', 'حسابك موثّق بالفعل')
      const now = new Date()
      const front = await encryptJpegDataUrl(env, me, 'front', parsed.front)
      const back = parsed.back ? await encryptJpegDataUrl(env, me, 'back', parsed.back) : ''
      await commit(env, [
        { kind: 'upsert', path: `idImages/${me}`, data: { front, back, at: now } },
        { kind: 'upsert', path: `idVerifications/${me}`, data: { uid: me, userName: String(user.data.displayName ?? ''), userEmail: String(user.data.email ?? '').toLowerCase(), docType: parsed.docType, status: 'pending', hasImages: true, submittedAt: now, consentAt: now, note: '', decidedAt: null, decidedBy: null, viewedAt: null, viewedBy: null, purgedAt: null, purgedBy: null } },
      ])
      return json({ status: 'pending' })
    }

    if (b.action === 'cancel') {
      const cur = await getDocument(env, `idVerifications/${me}`)
      if (!cur || cur.data.status !== 'pending') throw new HttpError(409, 'not-pending', 'مفيش طلب تحت المراجعة')
      await commit(env, [{ kind: 'delete', path: `idImages/${me}` }, { kind: 'delete', path: `idVerifications/${me}` }])
      return json({ status: 'none' })
    }

    if (b.action === 'erase') { // the member deletes their own photos at any time (the verification itself, if granted, stays)
      const cur = await getDocument(env, `idVerifications/${me}`)
      if (!cur || cur.data.hasImages !== true) throw new HttpError(409, 'no-images', 'مفيش صور محفوظة')
      if (cur.data.status === 'pending') throw new HttpError(409, 'pending', 'الطلب لسه تحت المراجعة. الغيه الأول لو عايز تمسح الصور')
      await commit(env, [{ kind: 'delete', path: `idImages/${me}` }, { kind: 'upsert', path: `idVerifications/${me}`, data: { hasImages: false, purgedAt: new Date(), purgedBy: me } }])
      return json({ ok: true })
    }

    if (b.action === 'badge') { // the member shows or hides their own "verified" badge (the verification itself stays)
      if (user.data.verified !== true) throw new HttpError(400, 'not-verified', 'حسابك مش موثّق')
      const show = b.show === true
      const writes: Write[] = [{ kind: 'upsert', path: `users/${me}`, data: { badgeHidden: !show } }, ...(await badgeWrites(env, me, show))]
      await commit(env, writes)
      return json({ show, adsUpdated: writes.length - 1 })
    }

    // ---------- admin ----------
    if (!user.isAdmin) throw new HttpError(403, 'forbidden', 'مش مسموح')

    if (b.action === 'list') {
      const rows = await runQuery(env, { collection: 'idVerifications', orderBy: { field: 'submittedAt', dir: 'DESCENDING' }, limit: 300 })
      return json({ encryption: idKeyOk(env), requests: rows.map((r) => shape(r.id, r.data)) })
    }
    if (b.action === 'find') { // any member's record by exact email, even beyond the newest 300
      const email = clip(b.email, 120).toLowerCase()
      if (!email.includes('@')) throw new HttpError(400, 'bad-email', 'اكتب إيميل صحيح')
      const rows = await runQuery(env, { collection: 'idVerifications', where: [{ field: 'userEmail', op: 'EQUAL', value: email }], limit: 5 })
      return json({ requests: rows.map((r) => shape(r.id, r.data)) })
    }

    const uid = uidOf(b.uid)
    const rec = await getDocument(env, `idVerifications/${uid}`)
    if (!rec) throw new HttpError(404, 'not-found', 'مفيش طلب توثيق للعضو ده')

    if (b.action === 'view') { // any time, any status, as long as the photos still exist
      const img = await getDocument(env, `idImages/${uid}`)
      if (!img) throw new HttpError(404, 'no-images', 'الصور اتمسحت أو مش محفوظة')
      let front: string; let back: string | null
      try {
        front = await decryptJpegDataUrl(env, uid, 'front', String(img.data.front))
        back = img.data.back ? await decryptJpegDataUrl(env, uid, 'back', String(img.data.back)) : null
      } catch { throw new HttpError(500, 'decrypt', 'تعذّر فتح الصور. غالبًا مفتاح التشفير (ID_ENC_KEY) اتغيّر عن اللي اتشفّرت بيه') }
      await commit(env, [{ kind: 'upsert', path: `idVerifications/${uid}`, data: { viewedAt: new Date(), viewedBy: me } }]) // who looked, and when
      return json({ front, back })
    }

    if (b.action === 'purge') {
      if (rec.data.status === 'pending') throw new HttpError(409, 'pending', 'الطلب لسه تحت المراجعة. اتخذ القرار الأول')
      await commit(env, [{ kind: 'delete', path: `idImages/${uid}` }, { kind: 'upsert', path: `idVerifications/${uid}`, data: { hasImages: false, purgedAt: new Date(), purgedBy: me } }])
      return json({ ok: true })
    }

    const note = clip(b.note, 300)
    const now = new Date()
    const mark = (status: string): Write => ({ kind: 'upsert', path: `idVerifications/${uid}`, data: { status, decidedAt: now, decidedBy: me, note } })
    const guard = { [`idVerifications/${uid}`]: rec.updateTime }

    if (b.action === 'approve' || b.action === 'reject') {
      if (rec.data.status !== 'pending') throw new HttpError(409, 'decided', 'الطلب ده اتراجع قبل كده')
      if (b.action === 'reject') { await commitGuarded(env, [mark('rejected')], guard); return json({ status: 'rejected' }) }
      if (!(await getDocument(env, `users/${uid}`))) throw new HttpError(404, 'user-gone', 'الحساب اتحذف. ارفض الطلب')
      const writes: Write[] = [mark('approved'), { kind: 'upsert', path: `users/${uid}`, data: { verified: true, badgeHidden: false, idVerifiedAt: now } }, ...(await badgeWrites(env, uid, true))]
      await commitGuarded(env, writes, guard)
      return json({ status: 'approved', adsUpdated: writes.length - 2 })
    }

    if (b.action === 'revoke') {
      if (rec.data.status !== 'approved') throw new HttpError(409, 'not-approved', 'الحساب ده مش موثّق بالهوية')
      const writes: Write[] = [mark('revoked'), { kind: 'upsert', path: `users/${uid}`, data: { verified: false } }, ...(await badgeWrites(env, uid, false))]
      await commitGuarded(env, writes, guard)
      return json({ status: 'revoked' })
    }

    throw new HttpError(400, 'bad-action', 'إجراء غير معروف')
  } catch (e) { return errorResponse(e) }
}
