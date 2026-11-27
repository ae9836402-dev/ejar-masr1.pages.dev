import { useCallback, useEffect, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { normalizePromo, type PromoSettings } from '../../functions/_lib/promoCore'
import { useToast } from '../contexts/ToastContext'
import { ApiError, apiPost } from '../lib/api'
import { db } from '../lib/firebase'
import { fmtNum } from '../lib/format'
import { loadPromoSettings, resetPromoSettings } from '../lib/promoStore'
import { usePageMeta } from '../lib/seo'
import { Badge, Empty, ErrorBox, Field, Spinner } from '../components/ui'

interface Req { id: string; uid: string; userName: string; userEmail: string; kind: 'featured' | 'plan'; unitId: string | null; unitTitle: string; scope: 'gov' | 'all' | null; planName: string; days: number; amount: number; method: 'vodafone' | 'instapay'; reference: string; status: 'pending' | 'approved' | 'rejected'; note: string; createdAt: string | null }
const METHOD = { vodafone: 'فودافون كاش', instapay: 'إنستاباي' } as const
const STATUS = { pending: 'تحت المراجعة', approved: 'مُفعّل', rejected: 'مرفوض' } as const

export default function AdminPromo() {
  usePageMeta({ title: 'الترويج والباقات', noindex: true })
  const [tab, setTab] = useState<'requests' | 'settings'>('requests')
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-display text-3xl">الترويج والباقات</h1>
      <div className="mt-4 flex gap-2" role="tablist">
        {([['requests', 'الطلبات'], ['settings', 'الأسعار وأرقام الدفع']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} type="button" className={tab === k ? 'btn-primary !py-1.5' : 'btn-ghost !py-1.5'} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      <div className="mt-6">{tab === 'requests' ? <Requests /> : <SettingsForm />}</div>
    </div>
  )
}

function Requests() {
  const toast = useToast()
  const [rows, setRows] = useState<Req[] | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const load = useCallback(async () => { setErr(null); try { setRows((await apiPost<{ requests: Req[] }>('/api/promo', { action: 'list' })).requests) } catch (e) { setErr(e) } }, [])
  useEffect(() => { void load() }, [load])

  async function decide(r: Req, action: 'approve' | 'reject') {
    if (action === 'approve' && !window.confirm(`تأكدت إن ${fmtNum(r.amount)} جنيه وصلوا على ${METHOD[r.method]} (العملية ${r.reference})؟`)) return
    setBusy(r.id)
    try { await apiPost('/api/promo', { action, id: r.id, note: notes[r.id] ?? '' }); toast.ok(action === 'approve' ? 'تم التفعيل' : 'تم الرفض'); await load() } catch (e) { toast.err(e instanceof ApiError ? e.message : 'حصل خطأ') } finally { setBusy('') }
  }

  if (err) return <ErrorBox error={err} onRetry={() => void load()} />
  if (!rows) return <Spinner />
  if (rows.length === 0) return <Empty title="مفيش طلبات لسه" />
  const pending = rows.filter((r) => r.status === 'pending')
  return (
    <div className="space-y-6">
      <p className="text-sm text-mute">{pending.length} طلب تحت المراجعة. قبل التفعيل اتأكد من وصول المبلغ في محفظتك أو حسابك.</p>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="panel space-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={r.status === 'approved' ? 'nile' : r.status === 'pending' ? 'sand' : 'plain'}>{STATUS[r.status]}</Badge>
              <strong>{r.kind === 'featured' ? `إعلان مميز (${r.scope === 'all' ? 'كل مصر' : 'المحافظة'}) · ${r.days} أيام` : `باقة ${r.planName} · ${r.days} يوم`}</strong>
              <span className="text-nile">{fmtNum(r.amount)} جنيه</span>
              <span className="ms-auto text-mute">{r.createdAt ? new Date(r.createdAt).toLocaleString('ar-EG') : ''}</span>
            </div>
            <p className="text-mute">{r.userName} · {r.userEmail}{r.kind === 'featured' && r.unitId ? <> · <a className="underline" href={`/unit/${r.unitId}`} target="_blank" rel="noreferrer">{r.unitTitle || 'الإعلان'}</a></> : null}</p>
            <p>{METHOD[r.method]} · رقم العملية: <span dir="ltr" className="select-all font-mono">{r.reference}</span></p>
            {r.status === 'pending' ? (
              <div className="flex flex-wrap items-center gap-2">
                <input className="field !w-auto min-w-[12rem] flex-1" placeholder="ملاحظة للعميل (اختياري)" maxLength={300} value={notes[r.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
                <button type="button" className="btn-primary !py-1.5" disabled={busy === r.id} onClick={() => void decide(r, 'approve')}>تفعيل</button>
                <button type="button" className="btn-ghost !py-1.5 text-danger" disabled={busy === r.id} onClick={() => void decide(r, 'reject')}>رفض</button>
              </div>
            ) : r.note ? <p className="text-mute">ملاحظة: {r.note}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function SettingsForm() {
  const toast = useToast()
  const [s, setS] = useState<PromoSettings | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { void loadPromoSettings(true).then(setS) }, [])
  if (!s) return <Spinner />
  const set = (patch: Partial<PromoSettings>) => setS({ ...s, ...patch })
  const n = (v: string): number => (v.trim() === '' ? 0 : Number(v))
  const numInput = (value: number, on: (v: number) => void) => <input className="field" type="number" min={0} value={value} onChange={(e) => on(n(e.target.value))} />

  async function save() {
    const clean = normalizePromo(s)
    if (!clean.vodafoneCash && !clean.instapay) { toast.err('اكتب رقم فودافون كاش أو حساب إنستاباي على الأقل'); return }
    setBusy(true)
    try { await setDoc(doc(db, 'settings', 'promo'), clean); resetPromoSettings(); setS(clean); toast.ok('اتحفظ') } catch { toast.err('ماقدرناش نحفظ') } finally { setBusy(false) }
  }
  const upPlan = (i: number, patch: Partial<PromoSettings['plans'][number]>) => set({ plans: s.plans.map((p, k) => (k === i ? { ...p, ...patch } : p)) })

  return (
    <div className="space-y-6">
      <section className={`panel flex flex-wrap items-center gap-3 p-5 ${s.enabled ? '' : 'border-danger'}`}>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">الدفع للترويج والباقات: <span className={s.enabled ? 'text-nile' : 'text-danger'}>{s.enabled ? 'شغّال' : 'متوقف'}</span></h2>
          <p className="text-sm text-mute">لما يتوقف، صفحة الباقات بتقول «متوقف مؤقتًا» ومحدش يقدر يبعت طلب جديد. اللي اتفعّل قبل كده بيكمّل لحد انتهائه.</p>
        </div>
        <button type="button" className={s.enabled ? 'btn-ghost text-danger' : 'btn-primary'} disabled={busy} onClick={() => { const next = { ...s, enabled: !s.enabled }; setS(next); void (async () => { setBusy(true); try { await setDoc(doc(db, 'settings', 'promo'), normalizePromo(next)); resetPromoSettings(); toast.ok(next.enabled ? 'الدفع اتفتح' : 'الدفع اتقفل') } catch { setS(s); toast.err('ماقدرناش نحفظ') } finally { setBusy(false) } })() }}>{s.enabled ? 'إيقاف الدفع' : 'تشغيل الدفع'}</button>
      </section>
      <section className="panel space-y-3 p-5">
        <h2 className="text-lg font-semibold">أرقام الدفع (بتظهر للعملاء)</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="رقم فودافون كاش"><input className="field" dir="ltr" value={s.vodafoneCash} onChange={(e) => set({ vodafoneCash: e.target.value })} /></Field>
          <Field label="حساب إنستاباي (عنوان الدفع أو الرقم)"><input className="field" dir="ltr" value={s.instapay} onChange={(e) => set({ instapay: e.target.value })} /></Field>
          <Field label="الاسم على الحساب"><input className="field" value={s.payeeName} onChange={(e) => set({ payeeName: e.target.value })} /></Field>
        </div>
      </section>
      <section className="panel space-y-3 p-5">
        <h2 className="text-lg font-semibold">الإعلان المميز</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.featured.enabled} onChange={(e) => set({ featured: { ...s.featured, enabled: e.target.checked } })} /> مفعّل</label>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="المدة (أيام)">{numInput(s.featured.days, (v) => set({ featured: { ...s.featured, days: v } }))}</Field>
          <Field label="سعر أول المحافظة (جنيه)">{numInput(s.featured.priceGov, (v) => set({ featured: { ...s.featured, priceGov: v } }))}</Field>
          <Field label="سعر أول كل مصر (جنيه)">{numInput(s.featured.priceAll, (v) => set({ featured: { ...s.featured, priceAll: v } }))}</Field>
        </div>
      </section>
      <section className="panel space-y-3 p-5">
        <h2 className="text-lg font-semibold">حد الإعلانات بدون باقة</h2>
        <p className="text-sm text-mute">عدد الإعلانات النشطة المسموح لحساب من غير باقة. صفر = بلا حد.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="المالك">{numInput(s.freeMaxAds.owner, (v) => set({ freeMaxAds: { ...s.freeMaxAds, owner: v } }))}</Field>
          <Field label="السمسار">{numInput(s.freeMaxAds.broker, (v) => set({ freeMaxAds: { ...s.freeMaxAds, broker: v } }))}</Field>
        </div>
      </section>
      <section className="panel space-y-4 p-5">
        <h2 className="text-lg font-semibold">باقات السماسرة</h2>
        {s.plans.map((p, i) => (
          <div key={i} className="grid gap-3 rounded-field border border-line p-3 sm:grid-cols-6">
            <Field label="المعرّف (إنجليزي)"><input className="field" dir="ltr" value={p.id} onChange={(e) => upPlan(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} /></Field>
            <Field label="الاسم"><input className="field" value={p.name} onChange={(e) => upPlan(i, { name: e.target.value })} /></Field>
            <Field label="السعر">{numInput(p.price, (v) => upPlan(i, { price: v }))}</Field>
            <Field label="المدة (يوم)">{numInput(p.days, (v) => upPlan(i, { days: v }))}</Field>
            <Field label="كشف/يوم">{numInput(p.revealLimit, (v) => upPlan(i, { revealLimit: v }))}</Field>
            <Field label="إعلانات (0=بلا حد)">{numInput(p.maxAds, (v) => upPlan(i, { maxAds: v }))}</Field>
            <button type="button" className="btn-ghost !py-1 text-danger sm:col-span-6" onClick={() => set({ plans: s.plans.filter((_, k) => k !== i) })}>حذف الباقة</button>
          </div>
        ))}
        {s.plans.length < 6 && <button type="button" className="btn-ghost" onClick={() => set({ plans: [...s.plans, { id: `plan-${s.plans.length + 1}`, name: 'باقة جديدة', price: 500, days: 30, revealLimit: 100, maxAds: 50 }] })}>+ باقة</button>}
        <p className="text-xs text-mute">تعديل باقة لا يغيّر اللي اشترك فيها قبل كده: حدودها بتتحفظ وقت التفعيل.</p>
      </section>
      <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>{busy ? '...' : 'حفظ'}</button>
    </div>
  )
}
