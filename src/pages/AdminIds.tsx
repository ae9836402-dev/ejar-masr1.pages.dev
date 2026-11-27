import { useCallback, useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useToast } from '../contexts/ToastContext'
import { ApiError, apiPost } from '../lib/api'
import { db } from '../lib/firebase'
import { usePageMeta } from '../lib/seo'
import { Badge, Empty, ErrorBox, Spinner } from '../components/ui'

type Status = 'pending' | 'approved' | 'rejected' | 'revoked'
interface Req { uid: string; userName: string; userEmail: string; docType: 'national_id' | 'passport'; status: Status; note: string; submittedAt: string | null; decidedAt: string | null; viewedAt: string | null; viewedBy: string | null }
const STATUS: Record<Status, string> = { pending: 'تحت المراجعة', approved: 'موثّق', rejected: 'مرفوض', revoked: 'اتلغى' }
const DOC = { national_id: 'بطاقة رقم قومي', passport: 'جواز سفر' } as const

export default function AdminIds() {
  usePageMeta({ title: 'توثيق الهويات', noindex: true })
  const toast = useToast()
  const [rows, setRows] = useState<Req[] | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [open, setOpen] = useState<{ uid: string; front: string; back: string | null } | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    setErr(null)
    try {
      setRows((await apiPost<{ requests: Req[] }>('/api/id-verify', { action: 'list' })).requests)
      const s = await getDoc(doc(db, 'settings', 'idVerification')); setEnabled(s.exists() ? s.data().enabled !== false : true)
    } catch (e) { setErr(e) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function act(r: Req, action: 'approve' | 'reject' | 'revoke') {
    if (action === 'approve' && !window.confirm(`تأكدت إن الصور بتخص ${r.userName} وإنها واضحة وصحيحة؟`)) return
    if (action === 'revoke' && !window.confirm('إلغاء التوثيق وشيل الشارة من إعلانات العضو؟')) return
    setBusy(r.uid)
    try { await apiPost('/api/id-verify', { action, uid: r.uid, note: notes[r.uid] ?? '' }); toast.ok(action === 'approve' ? 'اتوثّق وصورة الهوية اتمسحت' : action === 'reject' ? 'اترفض وصورة الهوية اتمسحت' : 'اتلغى التوثيق'); setOpen(null); await load() } catch (e) { toast.err(e instanceof ApiError ? e.message : 'حصل خطأ') } finally { setBusy('') }
  }
  async function view(r: Req) {
    setBusy(r.uid)
    try { const img = await apiPost<{ front: string; back: string | null }>('/api/id-verify', { action: 'view', uid: r.uid }); setOpen({ uid: r.uid, ...img }); await load() } catch (e) { toast.err(e instanceof ApiError ? e.message : 'حصل خطأ') } finally { setBusy('') }
  }
  async function toggle() {
    const next = !(enabled ?? true)
    try { await setDoc(doc(db, 'settings', 'idVerification'), { enabled: next }); setEnabled(next); toast.ok(next ? 'التوثيق اتفتح' : 'التوثيق اتقفل') } catch { toast.err('ماقدرناش نحفظ') }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-display text-3xl">توثيق الهويات</h1>
      {enabled !== null && (
        <div className={`panel mt-4 flex flex-wrap items-center gap-3 p-4 ${enabled ? '' : 'border-danger'}`} role="status">
          <p className="min-w-0 flex-1">استقبال طلبات التوثيق: <b className={enabled ? 'text-nile' : 'text-danger'}>{enabled ? 'شغّال' : 'متوقف'}</b><span className="block text-sm text-mute">لما يتوقف، محدش يقدر يبعت طلب جديد. الشارات الحالية بتفضل زي ما هي.</span></p>
          <button type="button" className={enabled ? 'btn-ghost text-danger' : 'btn-primary'} onClick={() => void toggle()}>{enabled ? 'إيقاف' : 'تشغيل'}</button>
        </div>
      )}
      <p className="mt-3 text-sm text-mute">صور الهوية بيانات شخصية حساسة: متصوّرش الشاشة ومتشاركهاش. كل مرة بتفتح فيها وثيقة بيتسجّل اسمك ووقتها، والصور بتتمسح أول ما تاخد القرار.</p>
      <div className="mt-5">
        {err ? <ErrorBox error={err} onRetry={() => void load()} /> : !rows ? <Spinner /> : rows.length === 0 ? <Empty title="مفيش طلبات توثيق لسه" /> : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.uid} className="panel space-y-2 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={r.status === 'approved' ? 'nile' : r.status === 'pending' ? 'sand' : 'plain'}>{STATUS[r.status]}</Badge>
                  <strong>{r.userName}</strong><span className="text-mute">{r.userEmail}</span>
                  <span className="text-mute">· {DOC[r.docType] ?? r.docType}</span>
                  <span className="ms-auto text-mute">{r.submittedAt ? new Date(r.submittedAt).toLocaleString('ar-EG') : ''}</span>
                </div>
                {r.viewedAt && <p className="text-xs text-mute">اتفتحت آخر مرة {new Date(r.viewedAt).toLocaleString('ar-EG')}</p>}
                {r.status === 'pending' && (
                  <>
                    {open?.uid === r.uid ? (
                      <div className="flex flex-wrap gap-3">
                        {[open.front, open.back].map((u, i) => u && <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt={i ? 'ظهر الوثيقة' : 'وجه الوثيقة'} className="max-h-72 rounded-field border border-line object-contain" /></a>)}
                        <button type="button" className="btn-ghost self-start" onClick={() => setOpen(null)}>إخفاء الصور</button>
                      </div>
                    ) : <button type="button" className="btn-ghost" disabled={busy === r.uid} onClick={() => void view(r)}>عرض الوثيقة</button>}
                    <div className="flex flex-wrap items-center gap-2">
                      <input className="field !w-auto min-w-[12rem] flex-1" placeholder="ملاحظة للعضو (اختياري)" maxLength={300} value={notes[r.uid] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [r.uid]: e.target.value }))} />
                      <button type="button" className="btn-primary !py-1.5" disabled={busy === r.uid} onClick={() => void act(r, 'approve')}>توثيق</button>
                      <button type="button" className="btn-ghost !py-1.5 text-danger" disabled={busy === r.uid} onClick={() => void act(r, 'reject')}>رفض</button>
                    </div>
                  </>
                )}
                {r.status === 'approved' && <button type="button" className="btn-ghost !py-1.5 text-danger" disabled={busy === r.uid} onClick={() => void act(r, 'revoke')}>إلغاء التوثيق</button>}
                {r.note && r.status !== 'pending' && <p className="text-mute">ملاحظة: {r.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
