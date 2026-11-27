import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore'
import { DEFAULT_PROMO, type PromoSettings } from '../../functions/_lib/promoCore'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { ApiError, apiPost } from '../lib/api'
import { db } from '../lib/firebase'
import { fmtDate, fmtNum, isExpired } from '../lib/format'
import { activePlanOf, refLooksValid } from '../lib/promo'
import { loadPromoSettings } from '../lib/promoStore'
import { usePageMeta } from '../lib/seo'
import { ownerUnits } from '../lib/units'
import type { Unit } from '../lib/types'
import { Badge, Field, Spinner } from '../components/ui'

type Method = 'vodafone' | 'instapay'
interface Mine { id: string; kind: string; unitTitle: string; planName: string; scope: string | null; amount: number; method: string; reference: string; status: 'pending' | 'approved' | 'rejected'; note: string; createdAt: Date | null }
const STATUS = { pending: 'تحت المراجعة', approved: 'تم التفعيل', rejected: 'مرفوض' } as const
const money = (n: number): string => `${fmtNum(n)} جنيه`

export default function Promote() {
  usePageMeta({ title: 'إعلانات مميزة وباقات السماسرة', description: 'ميّز إعلانك ليظهر أول القائمة، أو اشترك في باقة سمسار بحد كشف أعلى وإعلانات أكتر وشارة موثّق.' })
  const { user, profile } = useAuth()
  const toast = useToast()
  const [params] = useSearchParams()
  const [promo, setPromo] = useState<PromoSettings | null>(null)
  const [units, setUnits] = useState<Unit[]>([])
  const [mine, setMine] = useState<Mine[]>([])
  const [target, setTarget] = useState<{ kind: 'featured' } | { kind: 'plan'; planId: string }>({ kind: 'featured' })
  const [unitId, setUnitId] = useState(params.get('unit') ?? '')
  const [scope, setScope] = useState<'gov' | 'all'>('gov')
  const [method, setMethod] = useState<Method>('vodafone')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setPromo(await loadPromoSettings())
    if (!user) return
    const list = (await ownerUnits(user.uid).catch(() => [])).filter((u) => u.status === 'active' && !isExpired(u.expiresAt))
    setUnits(list)
    setUnitId((cur) => (cur && list.some((u) => u.id === cur) ? cur : list[0]?.id ?? ''))
    const snap = await getDocs(query(collection(db, 'promoRequests'), where('uid', '==', user.uid))).catch(() => null)
    setMine((snap?.docs ?? []).map((d) => { const x = d.data(); return { id: d.id, kind: String(x.kind), unitTitle: String(x.unitTitle ?? ''), planName: String(x.planName ?? ''), scope: typeof x.scope === 'string' ? x.scope : null, amount: Number(x.amount) || 0, method: String(x.method), reference: String(x.reference), status: (x.status as Mine['status']) ?? 'pending', note: String(x.note ?? ''), createdAt: x.createdAt instanceof Timestamp ? x.createdAt.toDate() : null } }).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)))
  }, [user])
  useEffect(() => { void load() }, [load])

  const p = promo ?? DEFAULT_PROMO
  const plan = target.kind === 'plan' ? p.plans.find((x) => x.id === target.planId) : undefined
  const amount = target.kind === 'featured' ? (scope === 'all' ? p.featured.priceAll : p.featured.priceGov) : plan?.price ?? 0
  const payTo = method === 'vodafone' ? p.vodafoneCash : p.instapay
  const configured = !!(p.vodafoneCash || p.instapay)
  const current = activePlanOf(profile)

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!user) return
    if (!refLooksValid(reference)) { toast.err('اكتب رقم عملية التحويل أو رقم الموبايل اللي حوّلت منه (4 إلى 40 حرف)'); return }
    if (target.kind === 'featured' && !unitId) { toast.err('اختار الإعلان الأول'); return }
    setBusy(true)
    try {
      await apiPost('/api/promo', { action: 'request', ...(target.kind === 'featured' ? { kind: 'featured', unitId, scope } : { kind: 'plan', planId: target.planId }), method, reference: reference.trim() })
      toast.ok('وصلنا طلبك. هنراجع التحويل ونفعّل خلال ساعات.')
      setReference('')
      await load()
    } catch (e) { toast.err(e instanceof ApiError ? e.message : 'حصل خطأ، حاول مرة تانية') } finally { setBusy(false) }
  }

  if (!promo) return <Spinner />
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-display text-3xl">إعلانات مميزة وباقات السماسرة</h1>
      <p className="mt-2 text-mute">الدفع بتحويل فودافون كاش أو إنستاباي، من غير بطاقة ولا بوابة دفع. بعد التحويل ابعت رقم العملية وإحنا نفعّل بعد المراجعة.</p>
      {current && <p className="mt-3 rounded-field border border-nile p-3 text-sm">باقتك الحالية: <strong>{current.name}</strong> · تنتهي {fmtDate(current.until)} · كشف أرقام لحد {fmtNum(current.revealLimit)} يوميًا · {current.maxAds === 0 ? 'إعلانات بلا حد' : `لحد ${fmtNum(current.maxAds)} إعلان نشط`}</p>}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">⭐ ميّز إعلانك</h2>
        <p className="mt-1 text-sm text-mute">الإعلان المميز بيظهر أول القائمة وعليه شارة «مميز» لمدة {p.featured.days} أيام.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {([['gov', 'أول إعلانات المحافظة', p.featured.priceGov, 'بيظهر في الأول لما الزائر يبحث في محافظة إعلانك'], ['all', 'أول القائمة في كل مصر', p.featured.priceAll, 'بيظهر في الأول في كل نتائج البحث']] as const).map(([k, name, price, hint]) => (
            <button key={k} type="button" disabled={!p.featured.enabled} onClick={() => { setTarget({ kind: 'featured' }); setScope(k) }} aria-pressed={target.kind === 'featured' && scope === k} className={`panel p-4 text-start ${target.kind === 'featured' && scope === k ? 'border-nile ring-2 ring-nile' : ''}`}>
              <p className="font-semibold">{name}</p><p className="text-2xl font-bold text-nile">{money(price)}</p><p className="text-sm text-mute">{hint}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">باقات السماسرة</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {p.plans.map((pl) => (
            <button key={pl.id} type="button" onClick={() => setTarget({ kind: 'plan', planId: pl.id })} aria-pressed={target.kind === 'plan' && target.planId === pl.id} className={`panel p-4 text-start ${target.kind === 'plan' && target.planId === pl.id ? 'border-nile ring-2 ring-nile' : ''}`}>
              <p className="font-semibold">{pl.name} <Badge tone="sand">موثّق</Badge></p>
              <p className="text-2xl font-bold text-nile">{money(pl.price)} <span className="text-sm font-normal text-mute">/ {pl.days} يوم</span></p>
              <ul className="mt-2 list-inside list-disc text-sm text-mute">
                <li>كشف بيانات التواصل لحد {fmtNum(pl.revealLimit)} إعلان في اليوم</li>
                <li>{pl.maxAds === 0 ? 'إعلانات نشطة بلا حد' : `لحد ${fmtNum(pl.maxAds)} إعلان نشط`}</li>
                <li>شارة «موثّق» على كل إعلاناتك</li>
              </ul>
            </button>
          ))}
        </div>
        {p.freeMaxAds.broker > 0 && <p className="mt-2 text-xs text-mute">بدون باقة: السمسار لحد {fmtNum(p.freeMaxAds.broker)} إعلانات نشطة.</p>}
      </section>

      <section className="panel mt-8 p-5">
        <h2 className="text-xl font-semibold">الدفع وإرسال الطلب</h2>
        {!configured ? <p className="mt-2 text-mute">الدفع لسه مش متفعّل. جرّب بعد شوية.</p> : !user ? <p className="mt-2">سجّل دخولك الأول: <Link className="underline" to="/login">تسجيل الدخول</Link></p> : (
          <form className="mt-3 space-y-4" onSubmit={(e) => void submit(e)}>
            <p className="font-medium">
              {target.kind === 'featured' ? `إعلان مميز (${scope === 'all' ? 'كل مصر' : 'المحافظة'}) · ${p.featured.days} أيام` : `باقة ${plan?.name ?? ''} · ${plan?.days ?? 0} يوم`} — المطلوب: <span className="text-nile">{money(amount)}</span>
            </p>
            {target.kind === 'featured' && (
              <Field label="الإعلان اللي عايز تميّزه" hint={units.length === 0 ? 'لازم يكون عندك إعلان منشور وساري' : undefined}>
                <select className="field" value={unitId} onChange={(e) => setUnitId(e.target.value)}>{units.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}</select>
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="طريقة الدفع">
                <select className="field" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                  {p.vodafoneCash && <option value="vodafone">فودافون كاش</option>}
                  {p.instapay && <option value="instapay">إنستاباي</option>}
                </select>
              </Field>
              <div className="rounded-field border border-line p-3 text-sm">
                <p className="text-mute">حوّل {money(amount)} على:</p>
                <p dir="ltr" className="select-all text-start text-lg font-bold">{payTo || '—'}</p>
                {p.payeeName && <p className="text-mute">باسم: {p.payeeName}</p>}
              </div>
            </div>
            <Field label="رقم عملية التحويل (أو الموبايل اللي حوّلت منه)" hint="بنراجعه مع حسابنا قبل التفعيل. رقم العملية الواحد بيتسجّل مرة واحدة بس.">
              <input className="field" dir="ltr" value={reference} maxLength={40} onChange={(e) => setReference(e.target.value)} inputMode="text" autoComplete="off" />
            </Field>
            <button className="btn-primary" disabled={busy || (target.kind === 'featured' && !unitId)}>{busy ? '...' : 'أرسل الطلب'}</button>
          </form>
        )}
      </section>

      {mine.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">طلباتي</h2>
          <ul className="mt-3 space-y-2">
            {mine.map((r) => (
              <li key={r.id} className="panel flex flex-wrap items-center gap-3 p-3 text-sm">
                <Badge tone={r.status === 'approved' ? 'nile' : r.status === 'pending' ? 'sand' : 'plain'}>{STATUS[r.status]}</Badge>
                <span className="min-w-0 flex-1">{r.kind === 'featured' ? `إعلان مميز: ${r.unitTitle}` : `باقة ${r.planName}`} · {money(r.amount)}</span>
                <span className="text-mute" dir="ltr">{r.reference}</span>
                {r.createdAt && <span className="text-mute">{fmtDate(r.createdAt)}</span>}
                {r.note && <span className="w-full text-mute">ملاحظة: {r.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
