// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { onRequestPost as idv } from '../api/id-verify'
import { purgeExpiredIdImages } from '../_lib/idretention'
import { resetIdCache } from '../_lib/idverify'
import { TEST_KEY } from '../_lib/idcrypto.test'
import { jpeg } from './jpegFixture'
import { ADMIN, OTHER, OWNER, UNIT, as, call, seedUnit, seedUser, useWorld } from './harness'

vi.mock('../_lib/google', () => import('./fakeGoogle'))

const w = useWorld()
const PHOTO = jpeg(9000), BACK = jpeg(7000)
let key: string | undefined = TEST_KEY
const ask = (uid: string, body: Record<string, unknown>) => call(idv, { ...w.env, ID_ENC_KEY: key } as typeof w.env, { token: as(uid), body })
const submit = (uid = OWNER, over: Record<string, unknown> = {}) => ask(uid, { action: 'submit', docType: 'national_id', front: PHOTO, back: BACK, consent: true, ...over })
function ready() { key = TEST_KEY; seedUser(w.db, OWNER, { email: 'Owner@X.com' }); seedUser(w.db, OTHER); seedUser(w.db, ADMIN, { role: 'admin' }); seedUnit(w.db); resetIdCache() }

describe('POST /api/id-verify: member', () => {
  it('stores the photos encrypted; the status document carries no image', async () => {
    ready(); expect((await submit()).status).toBe(200)
    const im = w.db.get(`idImages/${OWNER}`)!
    expect(String(im.front).startsWith('enc1:') && String(im.back).startsWith('enc1:')).toBe(true)
    expect(String(im.front).includes(PHOTO.slice(60, 140))).toBe(false)
    expect(w.db.get(`idVerifications/${OWNER}`)).toMatchObject({ status: 'pending', hasImages: true, userEmail: 'owner@x.com' })
  })
  it('is refused without the encryption key, bad input, a second pending request, or when switched off', async () => {
    ready(); key = undefined
    expect((await submit()).json.error).toBe('id-key'); expect(w.db.get(`idImages/${OWNER}`)).toBeUndefined()
    key = TEST_KEY
    expect((await submit(OWNER, { consent: false })).json.error).toBe('bad-request')
    expect((await submit()).status).toBe(200); expect((await submit()).json.error).toBe('pending')
    w.db.seed('settings/idVerification', { enabled: false }); resetIdCache()
    expect((await submit(OTHER)).json.error).toBe('id-off')
  })
  it('cancelling a pending request deletes photos and record; a verified member can erase photos later; only a verified member can use the badge switch', async () => {
    ready(); await submit()
    expect((await ask(OWNER, { action: 'cancel' })).status).toBe(200)
    expect(w.db.get(`idImages/${OWNER}`)).toBeUndefined(); expect(w.db.get(`idVerifications/${OWNER}`)).toBeUndefined()
    await submit(); expect((await ask(OWNER, { action: 'erase' })).json.error).toBe('pending')
    await ask(ADMIN, { action: 'approve', uid: OWNER })
    expect((await ask(OWNER, { action: 'erase' })).status).toBe(200)
    expect(w.db.get(`idImages/${OWNER}`)).toBeUndefined(); expect(w.db.get(`users/${OWNER}`)?.verified).toBe(true)
    expect((await ask(OTHER, { action: 'badge', show: false })).json.error).toBe('not-verified')
  })
})

describe('POST /api/id-verify: admin', () => {
  it('members cannot list, find, view, decide or purge', async () => {
    ready(); await submit()
    for (const a of ['list', 'find', 'view', 'approve', 'reject', 'revoke', 'purge']) expect((await ask(OTHER, { action: a, uid: OWNER, email: 'a@b.c' })).status).toBe(403)
  })
  it('the admin can open an ID at any time (pending, after approval, after rejection), gets the exact photo, and each opening is logged', async () => {
    ready(); await submit()
    let r = await ask(ADMIN, { action: 'view', uid: OWNER })
    expect(r.status).toBe(200); expect(r.json.front).toBe(PHOTO); expect(r.json.back).toBe(BACK)
    expect(w.db.get(`idVerifications/${OWNER}`)).toMatchObject({ viewedBy: ADMIN })
    expect((await ask(ADMIN, { action: 'approve', uid: OWNER, note: 'تمام' })).status).toBe(200)
    r = await ask(ADMIN, { action: 'view', uid: OWNER }); expect(r.json.front).toBe(PHOTO)
    expect(w.db.get(`users/${OWNER}`)).toMatchObject({ verified: true, badgeHidden: false }); expect(w.db.get(`units/${UNIT}`)?.ownerVerified).toBe(true)
    expect((await ask(ADMIN, { action: 'approve', uid: OWNER })).json.error).toBe('decided')
    await ask(OWNER, { action: 'badge', show: false }); await ask(ADMIN, { action: 'revoke', uid: OWNER })
    expect((await ask(ADMIN, { action: 'view', uid: OWNER })).status).toBe(200) // revoked members' photos are still there until purged
  })
  it('rejected photos are kept too, and a new request is allowed', async () => {
    ready(); await submit()
    expect((await ask(ADMIN, { action: 'reject', uid: OWNER, note: 'غير واضحة' })).status).toBe(200)
    expect((await ask(ADMIN, { action: 'view', uid: OWNER })).status).toBe(200)
    expect(w.db.get(`users/${OWNER}`)?.verified).not.toBe(true); expect((await submit()).status).toBe(200)
  })
  it('purge deletes the photos (never while pending) and the verification stays', async () => {
    ready(); await submit()
    expect((await ask(ADMIN, { action: 'purge', uid: OWNER })).json.error).toBe('pending')
    await ask(ADMIN, { action: 'approve', uid: OWNER })
    expect((await ask(ADMIN, { action: 'purge', uid: OWNER })).status).toBe(200)
    expect(w.db.get(`idImages/${OWNER}`)).toBeUndefined(); expect(w.db.get(`idVerifications/${OWNER}`)).toMatchObject({ hasImages: false, purgedBy: ADMIN })
    expect((await ask(ADMIN, { action: 'view', uid: OWNER })).json.error).toBe('no-images'); expect(w.db.get(`users/${OWNER}`)?.verified).toBe(true)
  })
  it('a changed encryption key gives a clear error, and find/list return metadata only', async () => {
    ready(); await submit()
    const f = await ask(ADMIN, { action: 'find', email: 'OWNER@x.com' }); expect(f.json.requests).toHaveLength(1)
    expect((await ask(ADMIN, { action: 'find', email: 'nope' })).json.error).toBe('bad-email')
    const l = await ask(ADMIN, { action: 'list' }); expect(l.json.encryption).toBe(true); expect(JSON.stringify(l.json).includes('enc1:')).toBe(false)
    key = btoa('Z'.repeat(32)); const r = await ask(ADMIN, { action: 'view', uid: OWNER }); expect([r.status, r.json.error]).toEqual([500, 'decrypt'])
  })
  it('the member can hide and re-show the badge; revoking removes verification and the badge', async () => {
    ready(); await submit(); await ask(ADMIN, { action: 'approve', uid: OWNER })
    expect((await ask(OWNER, { action: 'badge', show: false })).status).toBe(200)
    expect(w.db.get(`users/${OWNER}`)?.badgeHidden).toBe(true); expect(w.db.get(`units/${UNIT}`)?.ownerVerified).toBe(false); expect(w.db.get(`users/${OWNER}`)?.verified).toBe(true)
    await ask(OWNER, { action: 'badge', show: true }); expect(w.db.get(`units/${UNIT}`)?.ownerVerified).toBe(true)
    await ask(ADMIN, { action: 'revoke', uid: OWNER, note: 'مخالفة' })
    expect(w.db.get(`users/${OWNER}`)?.verified).toBe(false); expect(w.db.get(`units/${UNIT}`)?.ownerVerified).toBe(false); expect(w.db.get(`idVerifications/${OWNER}`)?.status).toBe('revoked')
  })
})

describe('retention (optional auto-delete)', () => {
  const now = new Date('2027-06-01T00:00:00Z'), day = 86_400_000
  const rec = (id: string, status: string, ageDays: number) => { w.db.seed(`idVerifications/${id}`, { status, hasImages: true, decidedAt: new Date(now.getTime() - ageDays * day) }); w.db.seed(`idImages/${id}`, { front: 'enc1:x.y' }) }
  it('keeps everything when no period is set; with a period it purges only DECIDED requests older than it', async () => {
    rec('oldApproved01', 'approved', 100); rec('oldRejected01', 'rejected', 100); rec('freshApproved1', 'approved', 5); rec('oldPending0001', 'pending', 100)
    expect(await purgeExpiredIdImages(w.env, now, 10)).toBe(0)
    w.db.seed('settings/idVerification', { enabled: true, retentionMonths: 0 }); expect(await purgeExpiredIdImages(w.env, now, 10)).toBe(0)
    w.db.seed('settings/idVerification', { enabled: true, retentionMonths: 3 }); expect(await purgeExpiredIdImages(w.env, now, 10)).toBe(2)
    expect(w.db.get('idImages/oldApproved01')).toBeUndefined(); expect(w.db.get('idImages/oldRejected01')).toBeUndefined()
    expect(w.db.get('idImages/freshApproved1')).toBeDefined(); expect(w.db.get('idImages/oldPending0001')).toBeDefined()
    expect(w.db.get('idVerifications/oldApproved01')).toMatchObject({ hasImages: false, status: 'approved' })
  })
})
