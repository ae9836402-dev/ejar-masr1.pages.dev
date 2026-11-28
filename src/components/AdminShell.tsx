import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

/** One place for everything the admin controls: a sidebar with the sections, and the page on its left. (The public header has just one "لوحة الأدمن" link.) */
const GROUPS: { title: string; items: { to: string; label: string; end?: boolean }[] }[] = [
  { title: '', items: [{ to: '/admin', label: 'الرئيسية', end: true }] },
  { title: 'المحتوى', items: [{ to: '/admin/manage?tab=units', label: 'الإعلانات' }, { to: '/admin/manage?tab=reports', label: 'البلاغات' }, { to: '/admin/articles', label: 'المقالات والسيو' }, { to: '/admin/manage?tab=locations', label: 'المواقع' }] },
  { title: 'الأعضاء والثقة', items: [{ to: '/admin/manage?tab=users', label: 'المستخدمين' }, { to: '/admin/ids', label: 'توثيق الهويات' }] },
  { title: 'الفلوس', items: [{ to: '/admin/payments', label: 'مدفوعات الإيجار' }, { to: '/admin/promo', label: 'الترويج والباقات' }] },
  { title: 'الموقع', items: [{ to: '/admin/manage?tab=design', label: 'المظهر' }, { to: '/admin/manage?tab=settings', label: 'الإعدادات العامة' }, { to: '/admin/system', label: 'الذكاء الاصطناعي والفهرسة' }, { to: '/admin/manage?tab=stats', label: 'الإحصائيات' }, { to: '/admin/manage?tab=audit', label: 'سجل العمليات' }] },
]

export default function AdminShell() {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const here = loc.pathname + loc.search
  const active = (to: string, end?: boolean): boolean => (to.includes('?') ? here === to || (to.endsWith('tab=stats') && here === '/admin/manage') : end ? loc.pathname === to : loc.pathname.startsWith(to))
  const cls = (on: boolean): string => `block rounded-field px-3 py-2 text-sm ${on ? 'bg-nile-dark font-semibold text-white dark:text-paper' : 'hover:bg-surface'}`
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 md:flex-row">
      <button type="button" className="btn-ghost self-start md:hidden" aria-expanded={open} onClick={() => setOpen(!open)}>☰ قايمة الأدمن</button>
      <nav aria-label="لوحة الأدمن" className={`${open ? 'block' : 'hidden'} w-full shrink-0 space-y-4 md:block md:w-60`}>
        {GROUPS.map((g) => (
          <div key={g.title || 'home'}>
            {g.title && <p className="mb-1 px-3 text-xs text-mute">{g.title}</p>}
            {g.items.map((i) => <NavLink key={i.to} to={i.to} onClick={() => setOpen(false)} className={() => cls(active(i.to, i.end))}>{i.label}</NavLink>)}
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1"><Outlet /></div>
    </div>
  )
}
