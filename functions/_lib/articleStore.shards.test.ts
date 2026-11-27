// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DIR_SHARDS, MAX_ARTICLES, SHARD_BUDGET, deleteArticle, loadDirectory, saveArticle, type ArticleDoc, type DirEntry } from './articleStore'
import { makeEnv, useWorld } from '../_tests/harness'

vi.mock('./google', () => import('../_tests/fakeGoogle'))

const w = useWorld()
const env = () => makeEnv({})
beforeEach(() => {
  const s = new Map<string, { res: Response; until: number }>()
  vi.stubGlobal('caches', { default: { match: async (r: Request) => s.get(r.url)?.res.clone(), put: async (r: Request, x: Response) => { s.set(r.url, { res: x, until: 0 }) }, delete: async (r: Request) => s.delete(r.url) } })
})
afterEach(() => { vi.unstubAllGlobals() })

const doc = (slug: string, over: Partial<ArticleDoc> = {}): ArticleDoc => ({
  slug, title: `عنوان مقال ${slug} للاختبار`, description: 'وصف', body: '## عنوان\n\nنص المقال للاختبار الكامل.', primary: slug, secondary: [], faq: [], cover: null, images: [], videoId: null, videoTitle: '',
  status: 'draft', source: 'manual', topic: '', angle: '', govId: '', typeId: '', publishAt: null, publishedAt: null, createdAt: new Date(), updatedAt: new Date(), score: 0, issues: [], similarTo: null, ai: null, ...over,
})
/** Entries big enough that a few hundred fill one shard (like real ones: ~2 KB each). */
const fat = (i: number): DirEntry => ({
  slug: `old-${i}`, title: `قديم ${i}`, status: 'published', source: 'ai', topic: '', govId: '', typeId: '', primary: 'x', publishAt: null, publishedAt: 1, createdAt: 1000 + i, updatedAt: 1, score: 80, words: 1000,
  sig: Array.from({ length: 64 }, (_, k) => 2_000_000_000 - k - i), cover: '', description: 'ش'.repeat(200), coverAlt: 'ص'.repeat(600),
})
const seedFull = (): number => {
  const entries: DirEntry[] = []
  while (new TextEncoder().encode(JSON.stringify({ entries })).length < SHARD_BUDGET - 500) entries.push(fat(entries.length))
  w.db.seed('articleMeta/directory', { json: JSON.stringify({ entries }), updatedAt: new Date() })
  return entries.length
}

describe('sharded article directory', () => {
  it('limits are consistent: the shards can really hold the cap', () => {
    expect(DIR_SHARDS * SHARD_BUDGET).toBeGreaterThan(MAX_ARTICLES * 1700)
    expect(SHARD_BUDGET).toBeLessThan(1_048_487)
  })
  it('a small site still uses one document and no shard count', async () => {
    await saveArticle(env(), doc('اول'), { create: true })
    const dir = await loadDirectory(env())
    expect([dir.n, dir.entries.length]).toEqual([1, 1])
    expect(w.db.get('articleMeta/directory')?.n).toBeUndefined()
    expect(w.db.get('articleMeta/directory-2')).toBeUndefined()
  })
  it('when the first document is full, a new article opens the second one and shard 0 keeps its entries', async () => {
    const before = seedFull()
    const json0 = w.db.get('articleMeta/directory')?.json
    await saveArticle(env(), doc('جديد-بعد-الامتلاء'), { create: true })
    const dir = await loadDirectory(env())
    expect(dir.n).toBe(2)
    expect(dir.entries).toHaveLength(before + 1)
    expect(dir.entries[0].slug).toBe('جديد-بعد-الامتلاء') // newest first across shards
    expect(w.db.get('articleMeta/directory')?.json).toBe(json0) // untouched
    expect(w.db.get('articleMeta/directory')?.n).toBe(2)
    expect(JSON.parse(String(w.db.get('articleMeta/directory-2')?.json)).entries.map((e: DirEntry) => e.slug)).toEqual(['جديد-بعد-الامتلاء'])
  })
  it('editing keeps an article in its shard, and deleting removes it from the right one', async () => {
    seedFull()
    await saveArticle(env(), doc('جديد-اخر'), { create: true })
    await saveArticle(env(), doc('جديد-اخر', { title: 'عنوان معدّل للمقال الجديد تمامًا', updatedAt: new Date() }), { create: false })
    let dir = await loadDirectory(env())
    expect(dir.shards[1].entries.map((e) => e.slug)).toEqual(['جديد-اخر'])
    expect(dir.entries.filter((e) => e.slug === 'جديد-اخر')).toHaveLength(1)
    w.db.seed('articles/old-3', { slug: 'old-3' })
    expect(await deleteArticle(env(), 'old-3')).toBe(true)
    expect(await deleteArticle(env(), 'جديد-اخر')).toBe(true)
    dir = await loadDirectory(env())
    expect(dir.entries.some((e) => e.slug === 'old-3' || e.slug === 'جديد-اخر')).toBe(false)
    expect(await deleteArticle(env(), 'does-not-exist')).toBe(false)
  })
  it('renaming across shards leaves exactly one entry', async () => {
    seedFull()
    await saveArticle(env(), doc('اسم-قديم'), { create: true })
    await saveArticle(env(), doc('اسم-جديد'), { create: true, prevSlug: 'اسم-قديم' })
    const dir = await loadDirectory(env())
    expect(dir.entries.filter((e) => e.slug === 'اسم-قديم' || e.slug === 'اسم-جديد').map((e) => e.slug)).toEqual(['اسم-جديد'])
  })
})
