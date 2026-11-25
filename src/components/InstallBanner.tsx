import { useEffect, useState } from 'react'
import { ar } from '../i18n/ar'
import { dismissedRecently, rememberDismiss, useInstall } from '../lib/install'

/** Steps for iPhone / iPad, where the browser has no install button of its own. */
function IosSteps({ onClose }: { onClose(): void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={ar.install.iosTitle} className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div className="panel w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl">{ar.install.iosTitle}</h2>
        <ol className="mt-3 list-decimal space-y-2 ps-5 text-mute">
          {ar.install.iosSteps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <button type="button" className="btn-primary mt-5 w-full" onClick={onClose}>{ar.install.gotIt}</button>
      </div>
    </div>
  )
}

/** Button that installs the app (used in the footer, always available while installing is possible). */
export function InstallButton({ className = 'btn-ghost' }: { className?: string }) {
  const { available, ios, install } = useInstall()
  const [steps, setSteps] = useState(false)
  if (!available) return null
  return (
    <>
      <button type="button" className={className} onClick={() => (ios ? setSteps(true) : void install())}>{ar.install.cta}</button>
      {steps && <IosSteps onClose={() => setSteps(false)} />}
    </>
  )
}

/** A clear, dismissible card at the bottom of the screen that offers to install the site as an app. Appears a few seconds after arriving, never again for a week after "later". */
export function InstallBanner() {
  const { available, ios, install } = useInstall()
  const [ready, setReady] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [steps, setSteps] = useState(false)
  useEffect(() => { const t = setTimeout(() => setReady(true), 6000); return () => clearTimeout(t) }, [])

  if (!available || !ready || hidden || dismissedRecently()) return null
  const later = (): void => { rememberDismiss(); setHidden(true) }
  const go = async (): Promise<void> => {
    if (ios) { setSteps(true); return }
    const ok = await install()
    if (ok) setHidden(true); else later()
  }
  return (
    <>
      <div role="region" aria-label={ar.install.title} className="fixed inset-x-3 z-50 mx-auto max-w-md" style={{ bottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="panel flex items-center gap-3 border-nile-dark p-3 shadow-xl">
          <img src="/icon-192.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-base leading-tight">{ar.install.title}</p>
            <p className="text-sm text-mute">{ar.install.text}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5">
            <button type="button" className="btn-primary px-4 py-1.5 text-sm" onClick={() => void go()}>{ios ? ar.install.how : ar.install.cta}</button>
            <button type="button" className="text-xs text-mute underline" onClick={later}>{ar.install.later}</button>
          </div>
        </div>
      </div>
      {steps && <IosSteps onClose={() => { setSteps(false); later() }} />}
    </>
  )
}
