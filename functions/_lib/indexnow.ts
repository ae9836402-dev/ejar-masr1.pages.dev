/**
 * IndexNow: tells Bing, Yandex and other participating engines the moment a page is published or changed, instead of waiting days for them to crawl it.
 * (Google does not take part in IndexNow: it finds pages through sitemap.xml and links, and Search Console "Request indexing".)
 * Needs one setting, INDEXNOW_KEY (8-128 letters/digits/dashes, make one up). Without it every function here quietly does nothing.
 * The same key is served at /indexnow-key.txt so the engines can verify we own the site.
 */
import { siteUrl, type Env } from './env'

export const INDEXNOW_ENDPOINT = 'https://www.bing.com/indexnow'
const KEY_RE = /^[A-Za-z0-9-]{8,128}$/

export const indexNowKey = (env: Env): string | null => { const k = (env.INDEXNOW_KEY ?? '').trim(); return KEY_RE.test(k) ? k : null }

/** Best effort and never throws: a failed ping must never fail a publish. Returns the HTTP status (or null if not sent). */
export async function pingIndexNow(env: Env, paths: string[]): Promise<number | null> {
  const key = indexNowKey(env)
  if (!key || !paths.length) return null
  const base = siteUrl(env)
  const host = new URL(base).host
  const urlList = [...new Set(paths.map((p) => (p.startsWith('http') ? p : `${base}${p.startsWith('/') ? '' : '/'}${p}`)))].filter((u) => new URL(u).host === host).slice(0, 100)
  if (!urlList.length) return null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 4000)
  try {
    const r = await fetch(INDEXNOW_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ host, key, keyLocation: `${base}/indexnow-key.txt`, urlList }), signal: ctl.signal })
    return r.status
  } catch { return null } finally { clearTimeout(timer) }
}

/** A newly published (or updated) article: its page and the blog index that now lists it. */
export const announceArticle = (env: Env, slug: string): Promise<number | null> => pingIndexNow(env, [`/blog/${slug}`, '/blog'])
