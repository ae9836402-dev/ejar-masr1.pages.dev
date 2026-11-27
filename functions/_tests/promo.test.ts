// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { onRequestPost as promo } from '../api/promo'
import { resetPromoCache } from '../_lib/promo'
import { onRequestPost as reveal } from '../api/reveal'
import { ADMIN, NOW, OTHER, OWNER, TENANT, UNIT, as, call, seedUnit, seedUser, useWorld } from './harness'

vi.mock('../_lib/google', () => import('./fakeGoogle'))

const w = useWorld()
const DAY = 86_400_000
const SETTINGS = { vodafoneCash: '01012345678', instapay: 'ejar@instapay', payeeName: 'إيجار مصر', featured: { enabled: true, days: 7, priceGov: 100, priceAll: 250 }, plans: [{ id: 'broker-pro', name: 'سمسار محترف', price: 700, days: 30, revealLimit: 3, maxAds: 100 }], freeMaxAds: { owner: 0, broker: 5 } }
const ask = (uid: string, body: Record<string, unknown>) => call(promo, w.env, { token: as(uid), body })
function ready(settings: Record<string, unknown> | null = SETTINGS) {
  seedUser(w.db, OWNER); seedUser(w.db, OTHER); seedUser(w.db, ADMIN, { role: 'admin' }); seedUser(w.db, TENANT)
  seedUnit(w.db)
  if (settings) w.db.seed('settings/promo', settings)
}
const featuredReq = (over: Record<string, unknown> = {}) => ({ action: 'request', kind: 'featured', unitId: UNIT, scope: 'gov', method: 'vodafone', reference: 'TX-100200', ...over })
const onlyRequestId = () => w.db.list('promoRequests')[0].id

describe('POST /api/promo: requests (nothing changes until an admin approves)', () => {
  it('records a featured-ad request with the price from the server settings, and leaves the ad untouched', async () => {
    ready()
    const r = await ask(OWNER, { ...featuredReq(), amount: 1 }) // an amount sent by the browser is ignored
    expect(r.status).toBe(200)
    const doc = w.db.get(`promoRequests/${r.json.id}`)
    expect(doc).toMatchObject({ uid: OWNER, kind: 'featured', unitId: UNIT, scope: 'gov', amount: 100, days: 7, status: 'pending', method: 'vodafone', reference: 'TX-100200' })
    expect(w.db.get(`units/${UNIT}`)?.featuredUntil).toBeUndefined()
    expect((await ask(OWNER, featuredReq({ scope: 'all', reference: 'TX-777888' }))).json.amount).toBe(250)
  })
  it('refuses: someone else\'s ad, an unconfigured shop, a bad reference, a disabled method, and a reused transfer', async () => {
    ready()
    expect((await ask(OTHER, featuredReq())).json.error).toBe('not-found')
    expect((await ask(OWNER, featuredReq({ reference: 'x' }))).json.error).toBe('bad-request')
    expect((await ask(OWNER, featuredReq({ method: 'bank' }))).json.error).toBe('bad-request')
    expect((await ask(OWNER, featuredReq())).status).toBe(200)
    const again = await ask(OWNER, featuredReq({ scope: 'all' }))
    expect([again.status, again.json.error]).toEqual([409, 'ref-used'])
    w.db.seed('settings/promo', { ...SETTINGS, instapay: '' }); resetPromoCache()
    expect((await ask(OWNER, featuredReq({ method: 'instapay', reference: 'IP-123456' }))).json.error).toBe('method-off')
  })
  it('answers 503 until payment numbers are configured', async () => {
    ready(null)
    expect((await ask(OWNER, featuredReq())).json.error).toBe('promo-not-configured')
  })
  it('caps the number of requests waiting for review', async () => {
    ready()
    for (let i = 0; i < 5; i++) expect((await ask(OWNER, featuredReq({ reference: `REF-00${i}1` }))).status).toBe(200)
    expect((await ask(OWNER, featuredReq({ reference: 'REF-9999' }))).json.error).toBe('too-many')
  })
})

describe('POST /api/promo: admin decisions', () => {
  it('only admins can list, approve or reject', async () => {
    ready(); await ask(OWNER, featuredReq())
    for (const a of ['list', 'approve', 'reject']) expect((await ask(OWNER, { action: a, id: onlyRequestId() })).status).toBe(403)
  })
  it('approving a featured request sets the paid period on the ad; a second approval is refused; a renewal starts when the first ends', async () => {
    ready(); await ask(OWNER, featuredReq())
    const id = onlyRequestId()
    const ok = await ask(ADMIN, { action: 'approve', id })
    expect(ok.status).toBe(200)
    const first = w.db.get(`units/${UNIT}`)?.featuredUntil as Date
    expect(first.getTime() - Date.now()).toBeGreaterThan(6.9 * DAY); expect(first.getTime() - Date.now()).toBeLessThan(7.1 * DAY)
    expect(w.db.get(`units/${UNIT}`)?.featuredScope).toBe('gov')
    expect(w.db.get(`promoRequests/${id}`)).toMatchObject({ status: 'approved', decidedBy: ADMIN })
    expect((await ask(ADMIN, { action: 'approve', id })).json.error).toBe('decided')
    await ask(OWNER, featuredReq({ reference: 'TX-300400', scope: 'all' }))
    const id2 = w.db.list('promoRequests').find((r) => r.id !== id)!.id
    await ask(ADMIN, { action: 'approve', id: id2 })
    const second = w.db.get(`units/${UNIT}`)?.featuredUntil as Date
    expect(second.getTime() - first.getTime()).toBe(7 * DAY)
    expect(w.db.get(`units/${UNIT}`)?.featuredScope).toBe('all')
  })
  it('rejecting frees the transfer reference so a typo can be corrected', async () => {
    ready(); await ask(OWNER, featuredReq())
    const id = onlyRequestId()
    expect((await ask(ADMIN, { action: 'reject', id, note: 'المبلغ ناقص' })).status).toBe(200)
    expect(w.db.get(`promoRequests/${id}`)).toMatchObject({ status: 'rejected', note: 'المبلغ ناقص' })
    expect(w.db.get(`units/${UNIT}`)?.featuredUntil).toBeUndefined()
    expect((await ask(OWNER, featuredReq())).status).toBe(200)
  })
  it('approving a plan stores it with its limits, stamps the member\'s ads, and the plan raises the reveal limit', async () => {
    ready(); w.db.seed('settings/app', { dailyRevealLimit: 1 })
    seedUnit(w.db, { id: 'unitBBBBBB0002' })
    expect((await ask(TENANT, { action: 'request', kind: 'plan', planId: 'broker-pro', method: 'instapay', reference: 'IP-556677' })).status).toBe(200)
    const id = onlyRequestId()
    const ok = await ask(ADMIN, { action: 'approve', id })
    expect(ok.status).toBe(200)
    const plan = w.db.get(`users/${TENANT}`)?.plan as Record<string, unknown>
    expect(plan).toMatchObject({ id: 'broker-pro', revealLimit: 3, maxAds: 100 })
    expect((plan.until as Date).getTime() - Date.now()).toBeGreaterThan(29.9 * DAY)
    // the plan holder's own ads carry the badge period (these seeded ads belong to OWNER, so only a plan holder's would be stamped)
    expect(ok.json.adsUpdated).toBe(0)
    // reveal: base limit is 1, the plan allows 3
    for (const id of ['unitCCCCCC0001', 'unitCCCCCC0002', 'unitCCCCCC0003']) { seedUnit(w.db, { id }); w.db.seed(`contacts/${id}`, { ownerId: OWNER, phone: '01000000000', whatsapp: '' }) }
    for (const id of ['unitCCCCCC0001', 'unitCCCCCC0002', 'unitCCCCCC0003']) expect((await call(reveal, w.env, { token: as(TENANT), body: { unitId: id } })).status).toBe(200)
    seedUnit(w.db, { id: 'unitCCCCCC0004' }); w.db.seed('contacts/unitCCCCCC0004', { ownerId: OWNER, phone: '01000000001', whatsapp: '' })
    expect((await call(reveal, w.env, { token: as(TENANT), body: { unitId: 'unitCCCCCC0004' } })).json.error).toBe('limit')
  })
  it('an expired plan no longer raises the limit', async () => {
    ready(); w.db.seed('settings/app', { dailyRevealLimit: 1 })
    seedUser(w.db, TENANT, { plan: { id: 'broker-pro', name: 'x', until: new Date(new Date(NOW).getTime() - DAY), revealLimit: 50, maxAds: 10 } })
    for (const id of ['unitDDDDDD0001', 'unitDDDDDD0002']) { seedUnit(w.db, { id }); w.db.seed(`contacts/${id}`, { ownerId: OWNER, phone: '01000000000', whatsapp: '' }) }
    expect((await call(reveal, w.env, { token: as(TENANT), body: { unitId: 'unitDDDDDD0001' } })).status).toBe(200)
    expect((await call(reveal, w.env, { token: as(TENANT), body: { unitId: 'unitDDDDDD0002' } })).json.error).toBe('limit')
  })
  it('a plan approval stamps the plan end on the member\'s own ads (badge period)', async () => {
    ready(); seedUnit(w.db, { id: 'unitEEEEEE0001', ownerId: TENANT })
    await ask(TENANT, { action: 'request', kind: 'plan', planId: 'broker-pro', method: 'vodafone', reference: 'VC-889900' })
    const ok = await ask(ADMIN, { action: 'approve', id: onlyRequestId() })
    expect(ok.json.adsUpdated).toBe(1)
    expect((w.db.get('units/unitEEEEEE0001')?.ownerPlanUntil as Date).getTime()).toBe((w.db.get(`users/${TENANT}`)?.plan as { until: Date }).until.getTime())
  })
})
