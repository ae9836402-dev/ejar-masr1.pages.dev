import { describe, expect, it } from 'vitest'
import { activePlanOf, adLimit, isFeaturedUnit, refLooksValid, showVerified } from './promo'

const NOW = new Date('2027-03-10T10:00:00Z')
const DAY = 86_400_000
const plan = (until: Date) => ({ id: 'p', name: 'P', until, revealLimit: 50, maxAds: 40 })
const free = { freeMaxAds: { owner: 0, broker: 5 } }

describe('paid-period helpers', () => {
  it('featured only while the period runs', () => {
    expect(isFeaturedUnit({ featuredUntil: new Date(NOW.getTime() + DAY) }, NOW)).toBe(true)
    expect(isFeaturedUnit({ featuredUntil: new Date(NOW.getTime() - 1) }, NOW)).toBe(false)
    expect(isFeaturedUnit({ featuredUntil: null }, NOW)).toBe(false)
    expect(isFeaturedUnit({}, NOW)).toBe(false)
  })
  it('verified badge: admin-granted OR plan period still running', () => {
    expect(showVerified({ ownerVerified: true }, NOW)).toBe(true)
    expect(showVerified({ ownerVerified: false, ownerPlanUntil: new Date(NOW.getTime() + DAY) }, NOW)).toBe(true)
    expect(showVerified({ ownerVerified: false, ownerPlanUntil: new Date(NOW.getTime() - DAY) }, NOW)).toBe(false)
    expect(showVerified({ ownerVerified: false }, NOW)).toBe(false)
  })
  it('ad cap: plan wins while active; otherwise the free cap by account type (0 = unlimited)', () => {
    expect(adLimit({ accountType: 'broker', plan: plan(new Date(NOW.getTime() + DAY)) }, free, NOW)).toBe(40)
    expect(adLimit({ accountType: 'broker', plan: plan(new Date(NOW.getTime() - DAY)) }, free, NOW)).toBe(5)
    expect(adLimit({ accountType: 'owner', plan: null }, free, NOW)).toBe(0)
    expect(adLimit(null, free, NOW)).toBe(0)
    expect(activePlanOf({ plan: plan(new Date(NOW.getTime() - DAY)) }, NOW)).toBeNull()
  })
  it('reference check mirrors the server', () => {
    expect(refLooksValid('TX-123456')).toBe(true)
    expect(refLooksValid('abc')).toBe(false)
    expect(refLooksValid('<script>alert(1)</script>')).toBe(false)
  })
})
