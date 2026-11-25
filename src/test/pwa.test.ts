import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('installable app (PWA) files', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
    name: string; start_url: string; scope: string; display: string; dir: string; lang: string; theme_color: string
    icons: { src: string; sizes: string; purpose?: string }[]
  }
  it('manifest has what browsers require to offer "install"', () => {
    expect(manifest.name).toBeTruthy()
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url.startsWith('/')).toBe(true)
    expect(manifest.dir).toBe('rtl'); expect(manifest.lang).toBe('ar')
    const sizes = manifest.icons.map((i) => i.sizes)
    expect(sizes).toContain('192x192'); expect(sizes).toContain('512x512')
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)
  })
  it('every icon file the manifest names exists', () => {
    for (const i of manifest.icons) expect(existsSync(`public${i.src}`)).toBe(true)
  })
  it('the page links the manifest and the iPhone icon, and the offline page and worker exist', () => {
    const html = readFileSync('index.html', 'utf8')
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"')
    expect(html).toContain('rel="apple-touch-icon"')
    expect(existsSync('public/apple-touch-icon.png')).toBe(true)
    expect(existsSync('public/offline.html')).toBe(true)
    expect(readFileSync('public/sw.js', 'utf8')).toContain("e.request.mode !== 'navigate'") // never touches data or script requests
  })
})
