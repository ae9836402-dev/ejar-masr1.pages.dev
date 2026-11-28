import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, getCountFromServer, getDoc, query, setDoc, where } from 'firebase/firestore'
import { useToast } from '../contexts/ToastContext'
import { apiPost } from '../lib/api'
import { db } from '../lib/firebase'
import { loadPaySettings, resetPaySettings } from '../lib/rentals'
import { loadPromoSettings, resetPromoSettings } from '../lib/promoStore'
import { usePageMeta } from '../lib/seo'
import { Spinner } from '../components/ui'

interface Counts { ids: number; promo: number; reports: number }
interface Auto { enabled: boolean; lastRunAt: number | null; lastResult: string; lastError: string; [k: string]: unknown }
interface Row { key: string; title: string; hint: string; on: boolean }

/** The first screen: what needs a decision, and every on/off switch in one place. */
export default function AdminHome() {
  usePageMeta({ title: 'لوحة الأدمن', noindex: true })
  const toast = useToast()
  const [counts, setCounts] = useState<Counts | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [auto, setAuto] = useState<Auto | null>(null)
  const [busy, setBusy] = useState('')
  const [ai, setAi] = useState<string>('')

  const load = useCallback(async () => {
    resetPaySettings(); resetPromoSettings()
    const [pay, promo, idSnap, autoRes, ids, pr, rep] = await Promise.all([
      loadPaySettings().catch(() => null), loadPromoSettings(true).catch(() => null),
      getDoc(doc(db, 'settings', 'idVerification')).catch(() => null),
      apiPost<{ settings: Auto }>('/api/articles-admin', { action: 'settings' }).catch(() => null),
      apiPost<{ requests: { status: string }[] }>('/api/id-verify', { action: 'list' }).catch(() => null),
      apiPost<{ requests: { status: string }[] }>('/api/promo', { action: 'list' }).catch(() => null),
      getCountFromServer(query(collection(db, 'reports'), where('status', '==', 'new'))).catch(() => null),
    ])
    setCounts({ ids: ids?.requests.filter((r) => r.status === 'pending').length ?? 0, promo: pr?.requests.filter((r) => r.status === 'pending').length ?? 0, reports: rep?.data().count ?? 0 })
    setAuto(autoRes?.settings ?? null)
    setRows([
      { key: 'pay', title: 'الدفع الإلكتروني للإيجار', hint: 'طلبات الإيجار ودفع الأقساط', on: pay?.paymentsEnabled ?? true },
      { key: 'promo', title: 'الدفع للترويج والباقات', hint: 'الإعلانات المميزة وباقات السماسرة', on: promo?.enabled ?? true },
      { key: 'id', title: 'استقبال طلبات توثيق الهوية', hint: 'الطلبات الجديدة فقط', on: idSnap?.exists() ? idSnap.data()?.enabled !== false : true },
      ...(autoRes ? [{ key: 'auto', title: 'كتابة المقالات تلقائيًا', hint: 'حسب الجدول والحد اليومي', on: autoRes.settings.enabled }] : []),
    ])
  }, [])
  useEffect(() => { void load() }, [load])

  async function flip(r: Row) {
    const next = !r.on
    if (!next && r.key === 'pay' && !window.confirm('إيقاف الدفع الإلكتروني؟ المستأجرين الحاليين مش هيقدروا يدفعوا الأقساط الجديدة لحد ما تشغّله.')) return
    setBusy(r.key)
    try {
      if (r.key === 'pay') await setDoc(doc(db, 'settings', 'payments'), { paymentsEnabled: next }, { merge: true })
      if (r.key === 'promo') await setDoc(doc(db, 'settings', 'promo'), { enabled: next }, { merge: true })
      if (r.key === 'id') await setDoc(doc(db, 'settings', 'idVerification'), { enabled: next }, { merge: true })
      if (r.key === 'auto' && auto) await apiPost('/api/articles-admin', { action: 'settings-save', settings: { ...auto, enabled: next } })
      toast.ok(next ? 'اتفتح' : 'اتقفل'); await load()
    } catch { toast.err('ماقدرناش نغيّر') } finally { setBusy('') }
  }
  async function checkAi() {
    setBusy('ai'); setAi('')
    try {
      const r = await apiPost<{ ok: boolean; ms: number; model: string; error: string; fallback: { ok: boolean; model: string } | null }>('/api/articles-admin', { action: 'ai-check' })
      setAi(r.ok ? `شغّال: ${r.model} رد في ${(r.ms / 1000).toFixed(1)} ثانية` : r.fallback?.ok ? `الأساسي بطيء، لكن الاحتياطي ${r.fallback.model} شغّال والكتابة بتتحوّل له تلقائيًا` : `فيه مشكلة: ${r.error}`)
    } catch { setAi('الفحص فشل (ممكن مفتاح الذكاء الاصطناعي مش مضبوط)') } finally { setBusy('') }
  }

  if (!counts || !rows) return <Spinner />
  const card = (t: string, n: number, to: string) => (
    <Link to={to} className={`panel block p-4 ${n > 0 ? 'border-nile' : ''}`}><p className="text-sm text-mute">{t}</p><p className="text-3xl font-bold text-ink">{n}</p><p className="text-sm text-nile">{n > 0 ? 'راجعها ←' : 'مفيش حاجة'}</p></Link>
  )
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">الرئيسية</h1>
      <section>
        <h2 className="mb-2 font-semibold">محتاج مراجعتك</h2>
        <div className="grid gap-3 sm:grid-cols-3">{card('طلبات توثيق هوية', counts.ids, '/admin/ids')}{card('طلبات ترويج وباقات', counts.promo, '/admin/promo')}{card('بلاغات جديدة', counts.reports, '/admin/manage?tab=reports')}</div>
      </section>
      <section className="panel p-4">
        <h2 className="mb-1 font-semibold">مفاتيح التشغيل</h2>
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-3 border-b border-line py-3 last:border-0">
            <div className="min-w-0 flex-1"><p className="font-medium">{r.title}</p><p className="text-xs text-mute">{r.hint}</p></div>
            <b className={r.on ? 'text-nile' : 'text-danger'}>{r.on ? 'شغّال' : 'متوقف'}</b>
            <button type="button" className={r.on ? 'btn-ghost !py-1.5 text-danger' : 'btn-primary !py-1.5'} disabled={busy === r.key} onClick={() => void flip(r)}>{r.on ? 'إيقاف' : 'تشغيل'}</button>
          </div>
        ))}
      </section>
      <section className="panel space-y-2 p-4">
        <h2 className="font-semibold">فحص الصحة</h2>
        {auto && <p className="text-sm text-mute">آخر تشغيل للمقالات: {auto.lastRunAt ? new Date(auto.lastRunAt).toLocaleString('ar-EG') : '—'}{auto.lastError ? ` · آخر خطأ: ${auto.lastError}` : auto.lastResult ? ` · ${auto.lastResult}` : ''}</p>}
        <div className="flex flex-wrap items-center gap-3"><button type="button" className="btn-ghost" disabled={busy === 'ai'} onClick={() => void checkAi()}>{busy === 'ai' ? 'بيفحص…' : 'افحص الذكاء الاصطناعي'}</button>{ai && <span className="text-sm" role="status">{ai}</span>}</div>
        <p className="text-sm text-mute">مفاتيح الأسرار (موجودة/ناقصة) في <Link className="underline" to="/admin/system">الذكاء الاصطناعي والفهرسة</Link>.</p>
      </section>
    </div>
  )
}
