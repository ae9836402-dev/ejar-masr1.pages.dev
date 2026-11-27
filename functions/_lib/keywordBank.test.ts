// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { keywordBank, newBankTopics } from './keywordBank'
import { articlesForGov } from './seo'

describe('keyword bank', () => {
  const bank = keywordBank()
  it('is large, unique, and every topic is tied to a governorate', () => {
    expect(bank.length).toBeGreaterThan(400)
    expect(new Set(bank.map((t) => t.topic)).size).toBe(bank.length)
    expect(bank.every((t) => t.govId && t.topic.length >= 8 && t.topic.length <= 120)).toBe(true)
  })
  it('starts with the highest-demand areas', () => {
    expect(bank[0].topic).toBe('شقق للايجار في مدينة نصر')
    expect(bank.slice(0, 20).some((t) => t.topic.includes('التجمع الخامس'))).toBe(true)
  })
  it('puts the governorate on names that exist in two governorates', () => {
    expect(bank.filter((t) => t.topic.includes('المطرية')).every((t) => /القاهرة|الدقهلية/.test(t.topic))).toBe(true)
  })
  it('skips what is already queued, ignoring hamza and ta-marbuta spelling, and respects the room left', () => {
    const fresh = newBankTopics([{ topic: 'شقق للإيجار في مدينة نصر' }, { topic: 'شقق للايجار في المعادي' }], 5)
    expect(fresh).toHaveLength(5)
    expect(fresh.some((t) => t.topic.includes('مدينة نصر') && t.topic.startsWith('شقق للايجار في'))).toBe(false)
    expect(newBankTopics([], 0)).toEqual([])
  })
})

describe('articlesForGov', () => {
  const e = (slug: string, govId: string, publishedAt: number | null, status = 'published') => ({ slug, title: slug, status, govId, publishedAt })
  it('own governorate first, then general, newest first, published only, capped', () => {
    const r = articlesForGov([e('gen-new', '', 9), e('own-old', 'g1', 1), e('draft', 'g1', 5, 'draft'), e('own-new', 'g1', 7), e('other', 'g2', 8), e('gen-old', '', 2)], 'g1', 3)
    expect(r.map((x) => x.slug)).toEqual(['own-new', 'own-old', 'gen-new'])
  })
})
