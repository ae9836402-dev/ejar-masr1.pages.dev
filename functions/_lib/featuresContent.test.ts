// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { FEATURES_DESC, FEATURES_FAQ, FEATURES_TITLE, FEATURE_SECTIONS } from '../../src/content/features'

describe('features page content', () => {
  const all = [FEATURES_TITLE, FEATURES_DESC, ...FEATURE_SECTIONS.flatMap((s) => [s.h2, s.text]), ...FEATURES_FAQ.flatMap((f) => [f.q, f.a])].join(' ')
  it('has sensible meta lengths and enough sections and questions', () => {
    expect(FEATURES_TITLE.length).toBeLessThanOrEqual(65)
    expect(FEATURES_DESC.length).toBeGreaterThanOrEqual(110); expect(FEATURES_DESC.length).toBeLessThanOrEqual(165)
    expect(FEATURE_SECTIONS.length).toBeGreaterThanOrEqual(6); expect(FEATURES_FAQ.length).toBeGreaterThanOrEqual(4)
  })
  it('carries the keywords for the real features', () => {
    for (const k of ['من المالك مباشرة', 'تواصل مباشر', 'الخريطة', 'مقارنة', 'موثّق', 'أونلاين', 'إيجار شهري ويومي']) expect(all.includes(k) || all.includes(k.replace('مقارنة', 'قارن'))).toBe(true)
  })
  it('makes no promise the site cannot keep (no commission, guarantees, legal claims)', () => {
    for (const bad of ['بدون عمولة', 'من غير عمولة', 'مضمون', 'ضمان', 'قانون', 'مجاني']) expect(all.includes(bad)).toBe(false)
  })
})
