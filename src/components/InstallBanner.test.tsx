import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ar } from '../i18n/ar'
import { InstallBanner } from './InstallBanner'

type Fake = Event & { prompt: ReturnType<typeof vi.fn>; userChoice: Promise<{ outcome: string }> }
function browserOffersInstall(outcome = 'accepted'): Fake {
  const e = new Event('beforeinstallprompt') as Fake
  e.prompt = vi.fn().mockResolvedValue(undefined)
  e.userChoice = Promise.resolve({ outcome })
  act(() => { window.dispatchEvent(e) })
  return e
}

beforeEach(() => { localStorage.clear(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('InstallBanner', () => {
  it('shows nothing while the browser has not said the site can be installed', () => {
    render(<InstallBanner />)
    act(() => { vi.advanceTimersByTime(7000) })
    expect(screen.queryByRole('region', { name: ar.install.title })).toBeNull()
  })

  it('offers the install a few seconds after arriving, and the button opens the browser\'s own install dialog', async () => {
    render(<InstallBanner />)
    const e = browserOffersInstall()
    expect(screen.queryByRole('region', { name: ar.install.title })).toBeNull() // not instantly: no pop-up in the first seconds
    act(() => { vi.advanceTimersByTime(6000) })
    fireEvent.click(screen.getByRole('button', { name: ar.install.cta }))
    await act(async () => { await Promise.resolve() })
    expect(e.prompt).toHaveBeenCalledTimes(1)
  })

  it('"later" hides it and it does not come back for a week', () => {
    render(<InstallBanner />)
    browserOffersInstall()
    act(() => { vi.advanceTimersByTime(6000) })
    fireEvent.click(screen.getByRole('button', { name: ar.install.later }))
    expect(screen.queryByRole('region', { name: ar.install.title })).toBeNull()
    expect(Number(localStorage.getItem('ejar:install-dismissed-at'))).toBeGreaterThan(0)
  })
})
