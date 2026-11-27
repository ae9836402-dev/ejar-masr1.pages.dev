/** Client side of paid promotion: what a unit/profile looks like while a paid period is running. Pure helpers (no Firebase), so they can be tested. */
import type { PromoSettings } from '../../functions/_lib/promoCore'
import type { Unit, UserDoc } from './types'

export const isFeaturedUnit = (u: Pick<Unit, 'featuredUntil'>, now: Date = new Date()): boolean => !!u.featuredUntil && u.featuredUntil.getTime() > now.getTime()

/** The "verified" badge: set by an admin (ownerVerified) OR shown while the owner's paid plan period is running. */
export const showVerified = (u: Pick<Unit, 'ownerVerified' | 'ownerPlanUntil'>, now: Date = new Date()): boolean =>
  u.ownerVerified || (!!u.ownerPlanUntil && u.ownerPlanUntil.getTime() > now.getTime())

export const activePlanOf = (p: Pick<UserDoc, 'plan'> | null | undefined, now: Date = new Date()): NonNullable<UserDoc['plan']> | null =>
  p?.plan && p.plan.until.getTime() > now.getTime() ? p.plan : null

export type PromoSettingsView = PromoSettings

/** How many active ads this account may have. 0 = unlimited. (Checked in the ad form; see docs/PROMO.md for what is and is not enforced.) */
export const adLimit = (profile: Pick<UserDoc, 'plan' | 'accountType'> | null, s: Pick<PromoSettingsView, 'freeMaxAds'>, now: Date = new Date()): number => {
  const plan = activePlanOf(profile, now)
  if (plan) return plan.maxAds
  return profile?.accountType === 'broker' ? s.freeMaxAds.broker : s.freeMaxAds.owner
}

export const refLooksValid = (s: string): boolean => /^[\p{L}\p{N}\-_. #]{4,40}$/u.test(s.trim())
