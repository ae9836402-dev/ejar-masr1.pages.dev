// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DEFAULT_EDITOR, editorBlock, insertBeforeFirstSection, knownText, normalizeEditor, sourcesBlock, statsBlock } from './articleEditor'
import { analyzeArticle } from './articleQuality'
import type { Facts } from './articleAI'

const facts: Facts = { total: 120, inScope: 14, monthly: { min: 1500, median: 3200, max: 9000 }, byType: [{ id: 'شقة', count: 9 }], areas: [{ name: 'مدينة نصر', count: 5 }], govName: 'القاهرة' }

describe('normalizeEditor', () => {
  it('missing = defaults (features on, nothing else); explicit empties are kept; limits and junk are cleaned', () => {
    expect(normalizeEditor(undefined)).toEqual(DEFAULT_EDITOR)
    expect(normalizeEditor({ features: [] }).features).toEqual([])
    const e = normalizeEditor({ instructions: ' اكتب <b>كذا</b> ', features: [{ name: '', text: 'x' }, { name: 'ميزة', text: 'وصف' }], facts: ['قصير', 'حقيقة موثّقة طويلة كفاية'], research: 1 })
    expect(e.instructions.includes('<')).toBe(false)
    expect(e.features).toEqual([{ name: 'ميزة', text: 'وصف' }])
    expect(e.facts).toEqual(['حقيقة موثّقة طويلة كفاية'])
    expect(e.research).toBe(false) // only an explicit true turns it on
    expect(normalizeEditor({ research: true }).research).toBe(true)
  })
})

describe('editorBlock', () => {
  it('lists the rules, features, facts and research, and ends with the accuracy reminder', () => {
    const b = editorBlock({ instructions: 'بند أول\nبند ثاني', features: [{ name: 'تواصل مباشر', text: 'وصف' }], facts: ['حقيقة معتمدة هنا'], research: false }, 'بند للمقال ده', { text: 'نقطة من البحث', sources: [] })
    for (const s of ['- بند أول', '- بند ثاني', '- بند للمقال ده', 'تواصل مباشر: وصف', '- حقيقة معتمدة هنا', 'نقطة من البحث']) expect(b.includes(s)).toBe(true)
    expect(b.trimEnd().endsWith('الدقة أهم من تنفيذ البند.')).toBe(true)
  })
  it('is empty when there is nothing to add', () => expect(editorBlock({ instructions: '', features: [], facts: [], research: false }, '', null)).toBe(''))
})

describe('statsBlock / insertBeforeFirstSection / sourcesBlock', () => {
  it('writes real site numbers with the date, only when there is enough data', () => {
    const b = statsBlock(facts, '2026-11-28')!
    expect(b.startsWith('## أرقام من إعلانات الموقع (بتاريخ 2026-11-28)')).toBe(true)
    for (const s of ['14 وحدة', 'من 1500 إلى 9000', '3200', 'مدينة نصر (5)']) expect(b.includes(s)).toBe(true)
    expect(statsBlock({ ...facts, inScope: 2 }, 'd')).toBeNull()
    expect(statsBlock({ ...facts, monthly: null }, 'd')).toBeNull()
    expect(statsBlock({ ...facts, govName: undefined }, 'd')).toBeNull()
  })
  it('the numbers the code writes are never flagged as invented by the quality checker', () => {
    const body = `مقدمة [ابحث](/search) و[القاهرة](/rent/cairo)\n\n${statsBlock(facts, '2026-11-28')}\n\n## قسم\n\nنص.`
    const q = analyzeArticle({ title: 't', description: 'd', slug: 's', body, primary: 'شقق', secondary: [], faq: [], images: [], facts: 'عدد الوحدات 14 من 1500 إلى 9000 الوسيط 3200 مدينة نصر 5' })
    expect(q.issues.some((i) => i.includes('أرقام مش موجودة'))).toBe(false)
  })
  it('inserts right after the intro, or at the end when there are no sections', () => {
    expect(insertBeforeFirstSection('مقدمة\n\n## أول\n\nنص', 'BLOCK')).toBe('مقدمة\n\nBLOCK\n\n## أول\n\nنص')
    expect(insertBeforeFirstSection('نص فقط', 'BLOCK').endsWith('BLOCK\n')).toBe(true)
  })
  it('sources: only https links the research returned; none = no section', () => {
    expect(sourcesBlock(null)).toBeNull()
    expect(sourcesBlock({ text: 't', sources: [{ title: 'x', url: 'http://insecure.example' }, { title: 'javascript', url: 'javascript:alert(1)' }] })).toBeNull()
    const s = sourcesBlock({ text: 't', sources: [{ title: 'الجهاز [المركزي]', url: 'https://www.capmas.gov.eg/a' }] })!
    expect(s).toBe('## المصادر\n\n- [الجهاز المركزي](https://www.capmas.gov.eg/a)')
  })
  it('knownText feeds the checker with site facts, editor facts, instructions, per-article rules and research', () => {
    const k = knownText('SITE', { ...DEFAULT_EDITOR, instructions: 'INS', facts: ['FACT'] }, 'PER', { text: 'RES', sources: [] })
    for (const s of ['SITE', 'INS', 'FACT', 'PER', 'RES']) expect(k.includes(s)).toBe(true)
  })
})
