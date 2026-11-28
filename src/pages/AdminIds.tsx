import { useCallback, useEffect, useMemo, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useToast } from '../contexts/ToastContext'
import { ApiError, apiPost } from '../lib/api'
import { db } from '../lib/firebase'
import { usePageMeta } from '../lib/seo'
import { Badge, Empty, ErrorBox, Field, Spinner } from '../components/ui'

type Status = 'pending' | 'approved' | 'rejected' | 'revoked'
interface Req { uid: string; userName: string; userEmail: string; docType: 'national_id' | 'passport'; status: Status; note: string; hasImages: boolean; submittedAt: string | null; decidedAt: string | null; viewedAt: string | null; viewedBy: string | null }
const STATUS: Record<Status, string> = { pending: 'تحت المراجعة', approved: 'موثّق', rejected: 'مرفوض', revoked: 'اتلغى' }
const DOC = { national_id: 'بطاقة رقم قومي', passport: 'جواز سفر' } as const
const when = (v: string | null): string => (v ? new Date(v).toLocaleString('ar-EG') : '')

export default function AdminIds() {
  usePageMeta({ title: 'توثيق الهويات', noindex: true })
  const toast = useToast()
  const [rows, setRows] = useState<Req[] | null>(null)
  const [encryption, setEncryption] = useState(true)
  const [err, setErr] = useState<unknown>(null)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [months, setMonths] = useState(0)
  const [open, setOpen] = useState<{ uid: string; front: string; back: string | null } | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Req[] | null>(null)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    setErr(null)
    try {
      const r = await apiPost<{ requests: Req[]; encryption: boolean }>('/api/id-verify', { action: 'list' })
      setRows(r.requests); setEncryption(r.encryption)
      const s = await getDoc(doc(db, 'settings', 'idVerification'))
      setEnabled(s.exists() ? s.data().enabled !== false : true); setMonths(s.exists() ? Number(s.data().retentionMonths) || 0 : 0)
    } catch (e) { setErr(e) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function act(r: Req, action: 'approve' | 'reject' | 'revoke' | 'purge') {
    const ask: Record<string, string> = { approve: `تأكدت إن الصور بتخص ${r.userName} وإنها واضحة وصحيحة؟`, revoke: 'إلغاء التوثيق وشيل الشارة من إعلانات العضو؟', purge: 'تمسح صور الهوية نهائيًا؟ التوثيق نفسه هيفضل، لكن مش هتقدر تفتح الصور تاني.' }
    if (ask[action] && !window.confirm(ask[action])) return
    setBusy(r.uid)
    try {
      await apiPost('/api/id-verify', { action, uid: r.uid, note: notes[r.uid] ?? '' })
      toast.ok({ approve: 'اتوثّق', reject: 'اترفض', revoke: 'اتلغى التوثيق', purge: 'اتمسحت الصور' }[action]); setOpen(null); setFound(null); await load()
    } catch (e) { toast.err(e instanceof ApiError ? e.message : 'حصل خطأ') } finally { setBusy('') }
  }
  async function view(r: Req) {
    setBusy(r.uid)
    try { const img = await apiPost<{ front: string; back: string | null }>('/api/id-verify', { action: 'view', uid: r.uid }); setOpen({ uid: r.uid, ...img }); await load() } catch (e) { toast.err(e instanceof ApiError ? e.message : 'حصل خطأ') } finally { setBusy('') }
  }
  async function saveSettings(patch: { enabled?: boolean; retentionMonths?: number }) {
    try { await setDoc(doc(db, 'settings', 'idVerification'), patch, { merge: true }); if (patch.enabled !== undefined) setEnabled(patch.enabled); toast.ok('اتحفظ') } catch { toast.err('ماقدرناش نحفظ') }
  }
  async function find() {
    if (!q.includes('@')) return setFound(null)
    try { setFound((await apiPost<{ requests: Req[] }>('/api/id-verify', { action: 'find', email: q.trim() })).requests) } catch (e) { toast.err(e instanceof ApiError ? e.message : 'حصل خطأ') }
  }
  const shown = useMemo(() => {
    if (found) return found
    const t = q.trim().toLowerCase()
    return (rows ?? []).filter((r) => !t || `${r.userName} ${r.userEmail}`.toLowerCase().includes(t))
  }, [rows, q, found])

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-display text-3xl">توثيق الهويات</h1>
      {!encryption && <p className="mt-3 rounded-field border border-danger p-3 text-sm" role="alert">⚠️ مفتاح التشفير <b dir="ltr">ID_ENC_KEY</b> مش مضبوط في Cloudflare، فالأعضاء <b>ما يقدروش يبعتوا هوية</b> لحد ما تضيفه. ولّد مفتاح بـ <span dir="ltr">openssl rand -base64 32</span> وحطه Secret، واحتفظ بنسخة منه (لو ضاع، الصور القديمة ما تتفتحش).</p>}
      {enabled !== null && (
        <div className={`panel mt-4 space-y-3 p-4 ${enabled ? '' : 'border-danger'}`} role="status">
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1">استقبال طلبات التوثيق: <b className={enabled ? 'text-nile' : 'text-danger'}>{enabled ? 'شغّال' : 'متوقف'}</b><span className="block text-sm text-mute">لما يتوقف، محدش يقدر يبعت طلب جديد. الشارات والصور الحالية بتفضل.</span></p>
            <button type="button" className={enabled ? 'btn-ghost text-danger' : 'btn-primary'} onClick={() => void saveSettings({ enabled: !enabled })}>{enabled ? 'إيقاف' : 'تشغيل'}</button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="مسح الصور تلقائيًا بعد (شهور من القرار)" hint="صفر = تفضل محفوظة لحد ما تمسحها إنت أو العضو. بتتنفّذ مع الفحص اليومي.">
              <input className="field !w-32" type="number" min={0} max={120} value={months} onChange={(e) => setMonths(Math.max(0, Number(e.target.value) || 0))} />
            </Field>
            <button type="button" className="btn-ghost" onClick={() => void saveSettings({ retentionMonths: months })}>حفظ المدة</button>
          </div>
        </div>
      )}
      <p className="mt-3 text-sm text-mute">الصور محفوظة <b>مشفّرة</b> وتقدر تفتح هوية أي عضو في أي وقت (حتى بعد القرار). كل فتح بيتسجّل باسمك ووقته. هي بيانات حساسة: متصوّرش الشاشة ومتشاركهاش.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <input className="field !w-auto min-w-[16rem] flex-1" placeholder="دوّر بالاسم أو الإيميل" value={q} onChange={(e) => { setQ(e.target.value); setFound(null) }} aria-label="بحث" />
        {q.includes('@') && <button type="button" className="btn-ghost" onClick={() => void find()}>بحث دقيق بالإيميل (حتى لو قديم)</button>}
      </div>
      <div className="mt-5">
        {err ? <ErrorBox error={err} onRetry={() => void load()} /> : !rows ? <Spinner /> : shown.length === 0 ? <Empty title="مفيش نتايج" /> : (
          <ul className="space-y-3">
            {shown.map((r) => (
              <li key={r.uid} className="panel space-y-2 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={r.status === 'approved' ? 'nile' : r.status === 'pending' ? 'sand' : 'plain'}>{STATUS[r.status]}</Badge>
                  <strong>{r.userName}</strong><span className="text-mute" dir="ltr">{r.userEmail}</span>
                  <span className="text-mute">· {DOC[r.docType] ?? r.docType}</span>
                  <span className="ms-auto text-mute">{when(r.submittedAt)}</span>
                </div>
                {r.viewedAt && <p className="text-xs text-mute">اتفتحت آخر مرة {when(r.viewedAt)}</p>}
                {r.hasImages ? (
                  open?.uid === r.uid ? (
                    <div className="flex flex-wrap gap-3">
                      {[open.front, open.back].map((u, i) => u && <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt={i ? 'ظهر الوثيقة' : 'وجه الوثيقة'} className="max-h-72 rounded-field border border-line object-contain" /></a>)}
                      <button type="button" className="btn-ghost self-start" onClick={() => setOpen(null)}>إخفاء الصور</button>
                    </div>
                  ) : <button type="button" className="btn-ghost" disabled={busy === r.uid} onClick={() => void view(r)}>عرض الوثيقة</button>
                ) : <p className="text-xs text-mute">الصور اتمسحت.</p>}
                {r.status === 'pending' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="field !w-auto min-w-[12rem] flex-1" placeholder="ملاحظة للعضو (اختياري)" maxLength={300} value={notes[r.uid] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [r.uid]: e.target.value }))} />
                    <button type="button" className="btn-primary !py-1.5" disabled={busy === r.uid} onClick={() => void act(r, 'approve')}>توثيق</button>
                    <button type="button" className="btn-ghost !py-1.5 text-danger" disabled={busy === r.uid} onClick={() => void act(r, 'reject')}>رفض</button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {r.status === 'approved' && <button type="button" className="btn-ghost !py-1.5 text-danger" disabled={busy === r.uid} onClick={() => void act(r, 'revoke')}>إلغاء التوثيق</button>}
                  {r.hasImages && r.status !== 'pending' && <button type="button" className="btn-ghost !py-1.5 text-danger" disabled={busy === r.uid} onClick={() => void act(r, 'purge')}>مسح الصور</button>}
                </div>
                {r.note && r.status !== 'pending' && <p className="text-mute">ملاحظة: {r.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
