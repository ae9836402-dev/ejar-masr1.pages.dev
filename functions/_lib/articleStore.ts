/** Storage for blog articles. The article body lives in articles/{slug}; a directory (one document, or a few once there are hundreds of articles) lists every article for the admin list, the public index, duplicate checks and sibling links. */
import { edgePurge } from './edgeLimit'
import type { Env } from './env'
import { commitGuarded, getDocument, type Write } from './firestore'
import { minhash } from './articleQuality'
import { wordCount, type ArticleImage } from './articleText'

export type ArticleStatus = 'draft' | 'scheduled' | 'published'
export interface ArticleDoc {
  slug: string; title: string; description: string; body: string; primary: string; secondary: string[]
  faq: { q: string; a: string }[]; cover: ArticleImage | null; images: ArticleImage[]; videoId: string | null; videoTitle: string
  status: ArticleStatus; source: 'ai' | 'manual'; topic: string; angle: string; govId: string; typeId: string
  publishAt: Date | null; publishedAt: Date | null; createdAt: Date; updatedAt: Date
  score: number; issues: string[]; similarTo: { slug: string; score: number } | null; ai: { provider: string; model: string } | null
}
export interface DirEntry {
  slug: string; title: string; status: ArticleStatus; source: 'ai' | 'manual'; topic: string; govId: string; typeId: string; primary: string
  publishAt: number | null; publishedAt: number | null; createdAt: number; updatedAt: number; score: number; words: number; sig: number[]; cover: string
  description: string; coverAlt: string
}

export const DIR_PATH = 'articleMeta/directory'
/**
 * The directory is split over up to DIR_SHARDS documents: one Firestore document holds about 1 MB, which is roughly 500 entries (an entry is ~1.7 KB, mostly
 * its 64-number duplicate fingerprint). Shard 0 is the original document and also records how many shards exist (`n`), so a site with few articles still
 * reads exactly ONE document. New articles go to the first shard with room; an existing article stays in its shard.
 */
export const DIR_SHARDS = 6
export const SHARD_BUDGET = 800_000 // bytes of JSON per shard (the hard limit is 1,048,487), leaving room for growth when an article is edited
export const MAX_ARTICLES = 2500 // 6 shards x ~800 KB at ~1.7 KB per entry is about 2,800, so this stays safely under
const shardPath = (i: number): string => (i === 0 ? DIR_PATH : `${DIR_PATH}-${i + 1}`)
const jsonBytes = (entries: DirEntry[]): number => new TextEncoder().encode(JSON.stringify({ entries })).length
const ms = (d: unknown): number | null => (d instanceof Date ? d.getTime() : null)
const dt = (d: unknown): Date | null => (d instanceof Date ? d : null)

export function toEntry(a: ArticleDoc): DirEntry {
  return {
    slug: a.slug, title: a.title, status: a.status, source: a.source, topic: a.topic, govId: a.govId, typeId: a.typeId, primary: a.primary,
    publishAt: ms(a.publishAt), publishedAt: ms(a.publishedAt), createdAt: a.createdAt.getTime(), updatedAt: a.updatedAt.getTime(), score: a.score, words: wordCount(a.body),
    sig: minhash(a.body), cover: a.cover?.id ?? a.images[0]?.id ?? '', description: a.description.slice(0, 200), coverAlt: a.cover?.alt ?? a.images[0]?.alt ?? '',
  }
}

interface Shard { path: string; entries: DirEntry[]; updateTime?: string; exists: boolean }
export interface Directory { entries: DirEntry[]; updateTime?: string; exists: boolean; shards: Shard[]; n: number }
const parseEntries = (d: { data: Record<string, unknown> } | null): DirEntry[] => {
  if (!d || typeof d.data.json !== 'string') return []
  try { return (JSON.parse(d.data.json) as { entries: DirEntry[] }).entries ?? [] } catch { return [] }
}
export async function loadDirectory(env: Env): Promise<Directory> {
  const first = await getDocument(env, shardPath(0))
  const n = Math.min(DIR_SHARDS, Math.max(1, Number(first?.data.n) || 1))
  const rest = await Promise.all(Array.from({ length: n - 1 }, (_, k) => getDocument(env, shardPath(k + 1))))
  const shards: Shard[] = [first, ...rest].map((d, i) => ({ path: shardPath(i), entries: parseEntries(d), updateTime: d?.updateTime, exists: !!d }))
  const seen = new Set<string>()
  const entries = shards.flatMap((sh) => sh.entries).filter((e) => (seen.has(e.slug) ? false : (seen.add(e.slug), true))).sort((x, y) => y.createdAt - x.createdAt)
  return { entries, updateTime: shards[0].updateTime, exists: shards[0].exists, shards, n }
}

const img = (v: unknown): ArticleImage | null => { const o = v as Record<string, unknown> | null; return o && typeof o.id === 'string' ? { id: o.id, alt: String(o.alt ?? ''), ...(typeof o.href === 'string' && o.href ? { href: o.href } : {}) } : null }
export function fromDoc(slug: string, d: Record<string, unknown>): ArticleDoc {
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
  const sim = d.similarTo as Record<string, unknown> | null
  const ai = d.ai as Record<string, unknown> | null
  return {
    slug, title: String(d.title ?? ''), description: String(d.description ?? ''), body: String(d.body ?? ''), primary: String(d.primary ?? ''), secondary: arr(d.secondary).map(String),
    faq: arr(d.faq).map((f) => ({ q: String((f as Record<string, unknown>).q ?? ''), a: String((f as Record<string, unknown>).a ?? '') })), cover: img(d.cover), images: arr(d.images).flatMap((i) => { const x = img(i); return x ? [x] : [] }),
    videoId: typeof d.videoId === 'string' && d.videoId ? d.videoId : null, videoTitle: String(d.videoTitle ?? ''),
    status: d.status === 'published' || d.status === 'scheduled' ? d.status : 'draft', source: d.source === 'ai' ? 'ai' : 'manual', topic: String(d.topic ?? ''), angle: String(d.angle ?? ''), govId: String(d.govId ?? ''), typeId: String(d.typeId ?? ''),
    publishAt: dt(d.publishAt), publishedAt: dt(d.publishedAt), createdAt: dt(d.createdAt) ?? new Date(0), updatedAt: dt(d.updatedAt) ?? new Date(0),
    score: Number(d.score) || 0, issues: arr(d.issues).map(String), similarTo: sim && typeof sim.slug === 'string' ? { slug: sim.slug, score: Number(sim.score) || 0 } : null, ai: ai && typeof ai.provider === 'string' ? { provider: ai.provider, model: String(ai.model ?? '') } : null,
  }
}
export async function readArticle(env: Env, slug: string): Promise<ArticleDoc | null> {
  const d = await getDocument(env, `articles/${slug}`)
  return d ? fromDoc(slug, d.data) : null
}

function toData(a: ArticleDoc): Record<string, unknown> {
  const { slug: _slug, ...rest } = a // the slug is the document id
  void _slug
  return { ...rest }
}

/**
 * Saves an article AND keeps the directory in step, in one atomic commit guarded against concurrent changes.
 * `create`: fail (ConflictError) if the slug is already taken. `prevSlug`: the article is being renamed (old document removed in the same commit).
 */
export async function saveArticle(env: Env, a: ArticleDoc, o: { create: boolean; prevSlug?: string }): Promise<DirEntry> {
  const dir = await loadDirectory(env)
  const entry = toEntry(a)
  const renamed = !!o.prevSlug && o.prevSlug !== a.slug
  if (dir.entries.filter((e) => e.slug !== a.slug && e.slug !== o.prevSlug).length >= MAX_ARTICLES) throw new Error(`article limit ${MAX_ARTICLES} reached`)
  const lists: DirEntry[][] = Array.from({ length: DIR_SHARDS }, (_, i) => dir.shards[i]?.entries ?? [])
  const homeOf = (slug: string): number => lists.findIndex((l) => l.some((e) => e.slug === slug))
  const touched = new Set<number>()
  const drop = (slug: string): number => { const h = homeOf(slug); if (h >= 0) { lists[h] = lists[h].filter((e) => e.slug !== slug); touched.add(h) } return h }
  if (renamed) drop(o.prevSlug as string)
  const home = drop(a.slug)
  // an edited article stays where it is if it still fits; otherwise (or when new) it goes to the first shard with room
  const fits = (i: number): boolean => jsonBytes([entry, ...lists[i]]) <= SHARD_BUDGET
  const target = home >= 0 && fits(home) ? home : lists.findIndex((_, i) => fits(i))
  if (target < 0) throw new Error('article directory is full')
  lists[target] = [entry, ...lists[target]]
  touched.add(target)
  const n = Math.max(dir.n, target + 1)

  const writes: Write[] = [o.create || renamed ? { kind: 'create', path: `articles/${a.slug}`, data: toData(a) } : { kind: 'upsert', path: `articles/${a.slug}`, data: toData(a) }]
  if (renamed) writes.push({ kind: 'delete', path: `articles/${o.prevSlug}` })
  const guards: Record<string, string | undefined> = {}
  const grew = n > dir.n
  for (const i of [...new Set([...touched, ...(grew ? [0] : [])])].sort((x, y) => x - y)) {
    const sh = dir.shards[i]
    const data: Record<string, unknown> = touched.has(i) ? { json: JSON.stringify({ entries: [...lists[i]].sort((x, y) => y.createdAt - x.createdAt) }), updatedAt: new Date() } : {}
    if (i === 0 && grew) data.n = n // the first shard records how many shards exist
    writes.push(sh?.exists ? { kind: 'upsert', path: shardPath(i), data } : { kind: 'create', path: shardPath(i), data })
    guards[shardPath(i)] = sh?.updateTime
  }
  await commitGuarded(env, writes, guards)
  await purgeArticle(a.slug); if (o.prevSlug) await purgeArticle(o.prevSlug)
  return entry
}

export async function deleteArticle(env: Env, slug: string): Promise<boolean> {
  const dir = await loadDirectory(env)
  const home = dir.shards.findIndex((sh) => sh.entries.some((e) => e.slug === slug))
  if (home < 0) return false
  const sh = dir.shards[home]
  const json = JSON.stringify({ entries: sh.entries.filter((e) => e.slug !== slug) })
  await commitGuarded(env, [{ kind: 'delete', path: `articles/${slug}` }, { kind: 'upsert', path: sh.path, data: { json, updatedAt: new Date() } }], { [sh.path]: sh.updateTime })
  await purgeArticle(slug)
  return true
}

/** Drops the cached copies (on this data center) of an article page and of the blog index / sitemap data. */
export async function purgeArticle(slug: string): Promise<void> { await Promise.all([edgePurge(`blog:${slug}`), edgePurge('blog-directory')]) }
