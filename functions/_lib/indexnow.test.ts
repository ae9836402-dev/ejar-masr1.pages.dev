// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from './env'
import { announceArticle, indexNowKey, pingIndexNow } from './indexnow'

const env = (over: Partial<Env> = {}): Env => ({ SITE_URL: 'https://ejar.example', INDEXNOW_KEY: 'abcdef1234567890', ...over }) as Env
afterEach(() => vi.unstubAllGlobals())

describe('IndexNow', () => {
  it('accepts only a well-formed key', () => {
    expect(indexNowKey(env())).toBe('abcdef1234567890')
    for (const bad of [undefined, '', 'short', 'has space in it 123', 'عربي1234567890']) expect(indexNowKey(env({ INDEXNOW_KEY: bad }))).toBeNull()
  })
  it('does nothing (and never calls the network) without a key', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    expect(await pingIndexNow(env({ INDEXNOW_KEY: undefined }), ['/blog/x'])).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })
  it('sends the host, key, key location and absolute URLs for this site only', async () => {
    const f = vi.fn(async () => new Response('', { status: 202 })); vi.stubGlobal('fetch', f)
    expect(await pingIndexNow(env(), ['/blog/a', 'https://ejar.example/blog/b', 'https://other.example/x', '/blog/a'])).toBe(202)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://www.bing.com/indexnow')
    expect(JSON.parse(String(init.body))).toEqual({ host: 'ejar.example', key: 'abcdef1234567890', keyLocation: 'https://ejar.example/indexnow-key.txt', urlList: ['https://ejar.example/blog/a', 'https://ejar.example/blog/b'] })
  })
  it('never throws when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await announceArticle(env(), 'some-slug')).toBeNull()
  })
})
