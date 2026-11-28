// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { activePlan, DEFAULT_PROMO, extendUntil, isFeaturedFor, maxAdsFor, normalizePromo, parseRequest, revealLimitFor } from './promoCore'
import { pageFromSnapshot, type Snapshot } from './listings'

const NOW = new Date('2027-03-10T10:00:00Z')
const DAY = 86_400_000

describe('normalizePromo', () => {
  it('fills defaults, clamps numbers, drops bad or duplicate plans', () => {
    const p = normalizePromo({ vodafoneCash: ' 0101 <b>', featured: { days: 9999, priceGov: -5 }, plans: [{ id: 'A B', price: 1 }, { id: 'ok', price: 'x' }, { id: 'ok', price: 5 }] })
    expect(p.vodafoneCash).toBe('0101 b'); expect(p.featured.days).toBe(90); expect(p.featured.priceGov).toBe(1)
    expect(p.plans.map((x) => x.id)).toEqual(['ok']); expect(p.plans[0].price).toBe(300)
    expect(normalizePromo(undefined)).toEqual({ ...DEFAULT_PROMO, plans: DEFAULT_PROMO.plans })
    expect(normalizePromo({ plans: [{ id: 'x1', featuredCredits: 99 }] }).plans[0].featuredCredits).toBe(50) // clamped
    expect(normalizePromo({ plans: [{ id: 'x2' }] }).plans[0].featuredCredits).toBe(0) // missing = none
    expect(normalizePromo({ enabled: false }).enabled).toBe(false) // an explicit off switch is kept
    expect(normalizePromo({}).enabled).toBe(true) // missing = on, so existing settings keep working
  })
})

describe('plans', () => {
  const user = (until: Date) => ({ accountType: 'broker', plan: { id: 'p', name: 'P', until, revealLimit: 80, maxAds: 40 } })
  it('is active only before its end date and raises (never lowers) the reveal limit', () => {
    expect(activePlan(user(new Date(NOW.getTime() + DAY)), NOW)?.revealLimit).toBe(80)
    expect(activePlan(user(new Date(NOW.getTime() - 1)), NOW)).toBeNull()
    expect(revealLimitFor(user(new Date(NOW.getTime() + DAY)), 20, NOW)).toBe(80)
    expect(revealLimitFor(user(new Date(NOW.getTime() + DAY)), 500, NOW)).toBe(500)
    expect(revealLimitFor({}, 20, NOW)).toBe(20)
  })
  it('ad cap: the plan\'s when active, otherwise the free cap for the account type', () => {
    expect(maxAdsFor(user(new Date(NOW.getTime() + DAY)), DEFAULT_PROMO, NOW)).toBe(40)
    expect(maxAdsFor(user(new Date(NOW.getTime() - DAY)), DEFAULT_PROMO, NOW)).toBe(5)
    expect(maxAdsFor({ accountType: 'owner' }, DEFAULT_PROMO, NOW)).toBe(0)
  })
  it('extendUntil starts from the later of now and the current end', () => {
    expect(extendUntil(null, 30, NOW).getTime()).toBe(NOW.getTime() + 30 * DAY)
    const end = new Date(NOW.getTime() + 10 * DAY)
    expect(extendUntil(end, 30, NOW).getTime()).toBe(end.getTime() + 30 * DAY)
    expect(extendUntil(new Date(NOW.getTime() - DAY), 7, NOW).getTime()).toBe(NOW.getTime() + 7 * DAY)
  })
})

describe('parseRequest', () => {
  it('accepts well-formed requests and explains what is wrong otherwise', () => {
    expect(parseRequest({ kind: 'featured', unitId: 'abc123', scope: 'all', method: 'vodafone', reference: 'TX 1234' })).toMatchObject({ kind: 'featured', scope: 'all' })
    expect(parseRequest({ kind: 'plan', planId: 'broker-pro', method: 'instapay', reference: '01012345678' })).toMatchObject({ kind: 'plan', planId: 'broker-pro' })
    for (const bad of [{ kind: 'x' }, { kind: 'plan', planId: 'a', method: 'cash', reference: 'abcd' }, { kind: 'plan', planId: 'a', method: 'vodafone', reference: '<script>' }, { kind: 'featured', unitId: '../x', scope: 'gov', method: 'vodafone', reference: 'abcd' }]) expect(typeof parseRequest(bad)).toBe('string')
  })
})

describe('featured ads come first in the snapshot, page after page', () => {
  const t = (ms: number) => ({ __ts: ms })
  const unit = (id: string, createdAt: number, over: Record<string, unknown> = {}) => ({ id, data: { governorateId: 'cairo', rentType: 'monthly', price: 1000, createdAt: t(createdAt), expiresAt: null, ...over } })
  const snap: Snapshot = { builtAt: 0, truncated: false, units: [
    unit('new1', NOW.getTime() - 1000), unit('new2', NOW.getTime() - 2000), unit('old-gov', NOW.getTime() - 9e6, { featuredUntil: t(NOW.getTime() + DAY), featuredScope: 'gov' }),
    unit('old-all', NOW.getTime() - 8e6, { featuredUntil: t(NOW.getTime() + DAY), featuredScope: 'all' }), unit('expired', NOW.getTime() - 7e6, { featuredUntil: t(NOW.getTime() - 1), featuredScope: 'all' }),
  ] }
  const ids = (q: Partial<Parameters<typeof pageFromSnapshot>[1]>) => pageFromSnapshot(snap, { sort: 'newest', n: 10, after: null, now: NOW.getTime(), ...q }).docs.map((d) => d.id)
  it('gov placement counts only inside that governorate; all-Egypt placement counts everywhere; expired does not count', () => {
    expect(ids({ gov: 'cairo' })).toEqual(['old-all', 'old-gov', 'new1', 'new2', 'expired'])
    expect(ids({})).toEqual(['old-all', 'new1', 'new2', 'expired', 'old-gov'])
  })
  it('paging with the cursor never skips or repeats a featured ad', () => {
    const p1 = pageFromSnapshot(snap, { gov: 'cairo', sort: 'newest', n: 2, after: null, now: NOW.getTime() })
    const p2 = pageFromSnapshot(snap, { gov: 'cairo', sort: 'newest', n: 2, after: p1.next, now: NOW.getTime() })
    const p3 = pageFromSnapshot(snap, { gov: 'cairo', sort: 'newest', n: 2, after: p2.next, now: NOW.getTime() })
    expect([...p1.docs, ...p2.docs, ...p3.docs].map((d) => d.id)).toEqual(['old-all', 'old-gov', 'new1', 'new2', 'expired'])
  })
  it('also first when sorting by lowest price', () => {
    expect(ids({ gov: 'cairo', sort: 'priceAsc' }).slice(0, 2).sort()).toEqual(['old-all', 'old-gov'])
  })
  it('isFeaturedFor handles Date and wire timestamps', () => {
    expect(isFeaturedFor({ featuredUntil: new Date(NOW.getTime() + 1), featuredScope: 'all' }, NOW.getTime())).toBe(true)
    expect(isFeaturedFor({ featuredUntil: t(NOW.getTime() + 1), featuredScope: 'gov', governorateId: 'cairo' }, NOW.getTime())).toBe(false)
  })
})
