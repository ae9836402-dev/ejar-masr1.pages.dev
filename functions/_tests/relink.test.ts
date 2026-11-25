// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { relinkSite } from '../_lib/articleText'

const base = 'https://new-domain.com'

describe('relinkSite: the site address inside articles follows the domain', () => {
  it('replaces {{site}} with the current address', () => {
    expect(relinkSite('زور [الموقع]({{site}}/search) و {{SITE_URL}}', base)).toBe('زور [الموقع](https://new-domain.com/search) و https://new-domain.com')
  })
  it('rewrites links to a previous domain (any scheme, with or without www) and bare mentions of it', () => {
    const md = '[أ](https://old.pages.dev/rent/cairo) [ب](http://www.old.pages.dev/search) النص: old.pages.dev'
    expect(relinkSite(md, base, ['https://old.pages.dev'])).toBe('[أ](https://new-domain.com/rent/cairo) [ب](https://new-domain.com/search) النص: new-domain.com')
  })
  it('leaves other sites and relative links alone, and does nothing when the domain did not change', () => {
    const md = '[خارجي](https://example.org/x) [داخلي](/search) [نفس](https://new-domain.com/a)'
    expect(relinkSite(md, base, ['https://old.pages.dev', base])).toBe(md)
  })
})

import { renderInline } from '../_lib/articleText'

describe('links inside articles are clickable', () => {
  const base = 'https://new-domain.com'
  it('a plain address typed in the text becomes a link, without swallowing the punctuation after it', () => {
    const h = renderInline('زوروا https://new-domain.com/search، أو https://example.org/x.', base)
    expect(h).toContain('<a href="https://new-domain.com/search">https://new-domain.com/search</a>،')
    expect(h).toContain('<a href="https://example.org/x" rel="nofollow noopener" target="_blank">https://example.org/x</a>.')
  })
  it("the site's own links are normal links (same tab, followed); other sites open in a new tab as nofollow", () => {
    expect(renderInline('[موقعنا](https://new-domain.com/)', base)).toBe('<a href="https://new-domain.com/">موقعنا</a>')
    expect(renderInline('[خارجي](https://example.org)', base)).toContain('rel="nofollow noopener" target="_blank"')
  })
  it('stays safe: unsafe schemes never become links, and a link is not linked twice', () => {
    expect(renderInline('[x](javascript:alert(1))', base)).not.toContain('<a')
    expect((renderInline('[a](https://example.org/p)', base).match(/<a /g) ?? []).length).toBe(1)
  })
})
