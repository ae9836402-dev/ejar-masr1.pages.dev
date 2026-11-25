import { useEffect, useState } from 'react'

/**
 * "Install the site as an app".
 *  - Android Chrome / Edge / desktop Chrome: the browser fires `beforeinstallprompt`; we keep that event and show our own clear button.
 *  - iPhone / iPad (Safari): there is no such event, the only way is Share > Add to Home Screen, so we show those steps.
 * The listeners are attached when this file is imported (from main.tsx), so the event is never missed before the banner mounts.
 */
interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const DISMISS_KEY = 'ejar:install-dismissed-at'
const DISMISS_DAYS = 7

let deferred: InstallEvent | null = null
let installed = false
const subs = new Set<() => void>()
const notify = (): void => subs.forEach((f) => f())

export const isStandalone = (): boolean =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

export const isIos = (): boolean => {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; notify() })
  window.addEventListener('appinstalled', () => { deferred = null; installed = true; notify() })
}

export const dismissedRecently = (): boolean => {
  try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < DISMISS_DAYS * 86_400_000 } catch { return false }
}
export function rememberDismiss(): void { try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* storage may be blocked */ } }

export interface InstallState {
  /** Nothing to show: already installed / opened as an app, or this browser cannot install. */
  available: boolean
  /** true on iPhone / iPad: show the Share > Add to Home Screen steps instead of calling prompt(). */
  ios: boolean
  /** Opens the browser's own install dialog (Android / desktop). Resolves true if the person accepted. */
  install(): Promise<boolean>
}

export function useInstall(): InstallState {
  const [, tick] = useState(0)
  useEffect(() => { const f = (): void => tick((n) => n + 1); subs.add(f); return () => { subs.delete(f) } }, [])
  const ios = isIos()
  const available = !installed && !isStandalone() && (!!deferred || ios)
  return {
    available, ios,
    async install() {
      if (!deferred) return false
      const e = deferred
      deferred = null // the browser allows one prompt per event
      notify()
      try { await e.prompt(); return (await e.userChoice).outcome === 'accepted' } catch { return false }
    },
  }
}
