export type Theme = 'light' | 'dark'

export function getTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** Colour of the browser's address bar / status bar on phones. */
export const themeColor = (t: Theme): string => (t === 'dark' ? '#0F0F10' : '#0B1B3A')

/** Keeps <meta name="theme-color"> in step with the theme (the page ships with the light value). */
export function syncThemeColor(): void {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor(getTheme()))
}

export function setTheme(t: Theme): void {
  document.documentElement.classList.toggle('dark', t === 'dark')
  syncThemeColor()
  try { localStorage.setItem('theme', t) } catch { /* storage may be blocked */ }
}
