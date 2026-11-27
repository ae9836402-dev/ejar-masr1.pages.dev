// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { onRequestPost as idv } from '../api/id-verify'
import { resetIdCache } from '../_lib/idverify'
import { jpeg } from './jpegFixture'
import { ADMIN, OTHER, OWNER, UNIT, as, call, seedUnit, seedUser, useWorld } from './harness'

vi.mock('../_lib/google', () => import('./fakeGoogle'))

const w = useWorld()
const ask = (uid: string, body: Record<string, unknown>) => call(idv, w.env, { token: as(uid), body })
const submit = (uid = OWNER, over: Record<string, unknown> = {}) => ask(uid, { action: 'submit', docType: 'national_id', front: jpeg(), back: jpeg(), consent: true, ...over })
function ready() { seedUser(w.db, OWNER); seedUser(w.db, OTHER); seedUser(w.db, ADMIN, { role: 'admin' }); seedUnit(w.db); resetIdCache() }

describe('POST /api/id-verify: member', () => {
  it('stores the photos only in the private collection and marks the request pending', async () => {
    ready()
    expect((await submit()).status).toBe(200)
    expect(w.db.get(`idVerifications/${OWNER}`)).toMatchObject({ status: 'pending', docType: 'national_id', uid: OWNER })
    expect(JSON.stringify(w.db.get(`idVerifications/${OWNER}`))).not.toContain('base64') // the status document carries no image
    expect(String(w.db.get(`idImages/${OWNER}`)?.front)).toContain('base64')
  })
  it('refuses missing consent, bad images, a second pending request, and a switched-off feature', async () => {
    ready()
    expect((await submit(OWNER, { consent: false })).json.error).toBe('bad-request')
    expect((await submit(OWNER, { front: 'data:image/jpeg;base64,AAAA' })).json.error).toBe('bad-request')
    expect((await submit()).status).toBe(200)
    expect((await submit()).json.error).toBe('pending')
    w.db.seed('settings/idVerification', { enabled: false }); resetIdCache()
    expect((await submit(OTHER)).json.error).toBe('id-off')
  })
  it('cancelling a pending request deletes the photos', async () => {
    ready(); await submit()
    expect((await ask(OWNER, { action: 'cancel' })).status).toBe(200)
    expect(w.db.get(`idImages/${OWNER}`)).toBeUndefined(); expect(w.db.get(`idVerifications/${OWNER}`)).toBeUndefined()
    expect((await ask(OWNER, { action: 'cancel' })).json.error).toBe('not-pending')
  })
  it('only a verified member can show or hide the badge', async () => {
    ready()
    expect((await ask(OTHER, { action: 'badge', show: false })).json.error).toBe('not-verified')
  })
})

describe('POST /api/id-verify: admin', () => {
  it('members cannot list, view or decide', async () => {
    ready(); await submit()
    for (const a of ['list', 'view', 'approve', 'reject', 'revoke']) expect((await ask(OTHER, { action: a, uid: OWNER })).status).toBe(403)
  })
  it('viewing returns the photos and records who looked', async () => {
    ready(); await submit()
    const r = await ask(ADMIN, { action: 'view', uid: OWNER })
    expect(r.status).toBe(200); expect(String(r.json.front)).toContain('base64'); expect(r.json.back).toBeTruthy()
    expect(w.db.get(`idVerifications/${OWNER}`)).toMatchObject({ viewedBy: ADMIN })
  })
  it('approving verifies the account, badges its ads, and DELETES the photos; a second decision is refused', async () => {
    ready(); await submit()
    const r = await ask(ADMIN, { action: 'approve', uid: OWNER, note: 'تمام' })
    expect(r.status).toBe(200)
    expect(w.db.get(`users/${OWNER}`)).toMatchObject({ verified: true, badgeHidden: false })
    expect(w.db.get(`units/${UNIT}`)?.ownerVerified).toBe(true)
    expect(w.db.get(`idImages/${OWNER}`)).toBeUndefined()
    expect(w.db.get(`idVerifications/${OWNER}`)).toMatchObject({ status: 'approved', decidedBy: ADMIN })
    expect((await ask(ADMIN, { action: 'approve', uid: OWNER })).json.error).toBe('decided')
    expect((await ask(ADMIN, { action: 'view', uid: OWNER })).json.error).toBe('no-images')
  })
  it('rejecting deletes the photos, changes nothing on the account, and allows a new request', async () => {
    ready(); await submit()
    expect((await ask(ADMIN, { action: 'reject', uid: OWNER, note: 'الصورة مش واضحة' })).status).toBe(200)
    expect(w.db.get(`idImages/${OWNER}`)).toBeUndefined()
    expect(w.db.get(`users/${OWNER}`)?.verified).not.toBe(true)
    expect(w.db.get(`idVerifications/${OWNER}`)).toMatchObject({ status: 'rejected', note: 'الصورة مش واضحة' })
    expect((await submit()).status).toBe(200)
  })
  it('the member can hide and re-show the badge; revoking removes verification and the badge', async () => {
    ready(); await submit(); await ask(ADMIN, { action: 'approve', uid: OWNER })
    expect((await ask(OWNER, { action: 'badge', show: false })).status).toBe(200)
    expect(w.db.get(`users/${OWNER}`)?.badgeHidden).toBe(true); expect(w.db.get(`units/${UNIT}`)?.ownerVerified).toBe(false)
    expect(w.db.get(`users/${OWNER}`)?.verified).toBe(true) // the verification itself stays
    await ask(OWNER, { action: 'badge', show: true })
    expect(w.db.get(`units/${UNIT}`)?.ownerVerified).toBe(true)
    expect((await ask(ADMIN, { action: 'revoke', uid: OWNER, note: 'مخالفة' })).status).toBe(200)
    expect(w.db.get(`users/${OWNER}`)?.verified).toBe(false); expect(w.db.get(`units/${UNIT}`)?.ownerVerified).toBe(false)
    expect(w.db.get(`idVerifications/${OWNER}`)?.status).toBe('revoked')
  })
})
