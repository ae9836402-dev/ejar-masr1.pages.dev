import { useCallback, useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { ApiError, apiPost } from '../lib/api'
import { db } from '../lib/firebase'
import { toJpegDataUrl } from '../lib/idImage'
import { Badge, Field, Spinner } from './ui'

type Status = 'none' | 'pending' | 'approved' | 'rejected' | 'revoked'
interface Rec { status: Status; docType: string; note: string; hasImages: boolean }

/** Account > توثيق الهوية. The member sends an ID photo for an admin to check; once verified they can show or hide the badge on their ads. */
export function IdVerification() {
  const { user, profile, refreshProfile } = useAuth()
  const toast = useToast()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [rec, setRec] = useState<Rec | null>(null)
  const [docType, setDocType] = useState<'national_id' | 'passport'>('national_id')
  const [front, setFront] = useState<string | null>(null)
  const [back, setBack] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    const [s, r] = await Promise.all([getDoc(doc(db, 'settings', 'idVerification')).catch(() => null), getDoc(doc(db, 'idVerifications', user.uid)).catch(() => null)])
    setEnabled(s?.exists() ? s.data().enabled !== false : true)
    const d = r?.exists() ? r.data() : null
    setRec({ status: (d?.status as Status) ?? 'none', docType: String(d?.docType ?? ''), note: String(d?.note ?? ''), hasImages: d?.hasImages === true })
  }, [user])
  useEffect(() => { void load() }, [load])

  async function pick(file: File | undefined, set: (v: string | null) => void) {
    if (!file) return set(null)
    try { set(await toJpegDataUrl(file)) } catch { set(null); toast.err('الصورة مش مقروءة أو كبيرة قوي. جرّب صورة تانية') }
  }
  async function call(body: Record<string, unknown>, ok: string) {
    setBusy(true)
    try { await apiPost('/api/id-verify', body); toast.ok(ok); setFront(null); setBack(null); setConsent(false); await load(); await refreshProfile() } catch (e) { toast.err(e instanceof ApiError ? e.message : 'حصل خطأ، حاول مرة تانية') } finally { setBusy(false) }
  }

  if (!user || enabled === null || !rec) return <Spinner />
  const verified = profile?.verified === true
  const ready = !!front && (docType === 'passport' || !!back) && consent

  return (
    <div className="panel max-w-xl space-y-4 p-5">
      <h2 className="text-xl font-semibold">توثيق الهوية</h2>
      <p className="text-sm text-mute">وثّق هويتك عشان تاخد شارة «موثّق» على إعلاناتك، وده بيزوّد ثقة الناس. الصور بتتحفظ <b>مشفّرة</b> وبيشوفها فريق الإدارة بس، وتقدر <b>تمسحها في أي وقت</b>. الموقع مش بيسجّل رقم البطاقة.</p>

      {verified && (
        <div className="space-y-3 rounded-field border border-nile p-4">
          <p><Badge tone="sand">موثّق</Badge> هويتك موثّقة.</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={profile?.badgeHidden !== true} disabled={busy} onChange={(e) => void call({ action: 'badge', show: e.target.checked }, e.target.checked ? 'الشارة ظاهرة على إعلاناتك' : 'الشارة اتخبّت من إعلاناتك')} />
            إظهار شارة «موثّق» على إعلاناتي
          </label>
          <p className="text-xs text-mute">لو أخفيتها، توثيقك بيفضل محفوظ وتقدر تظهرها تاني في أي وقت.</p>
        </div>
      )}

      {rec.status !== 'pending' && rec.status !== 'none' && rec.hasImages && (
        <div className="flex flex-wrap items-center gap-3 rounded-field border border-line p-3 text-sm">
          <span className="flex-1">صور هويتك محفوظة مشفّرة عندنا.</span>
          <button type="button" className="btn-ghost text-danger" disabled={busy} onClick={() => { if (window.confirm('تمسح صور هويتك نهائيًا؟ التوثيق بيفضل، لكن هتحتاج ترفعها تاني لو طلبنا.')) void call({ action: 'erase' }, 'اتمسحت صور هويتك') }}>مسح صور هويتي</button>
        </div>
      )}

      {rec.status === 'pending' && (
        <div className="space-y-2 rounded-field border border-line p-4">
          <p><Badge tone="sand">تحت المراجعة</Badge> وصلنا طلبك وهنراجعه.</p>
          <button type="button" className="btn-ghost text-danger" disabled={busy} onClick={() => void call({ action: 'cancel' }, 'اتلغى الطلب واتمسحت الصور')}>إلغاء الطلب ومسح الصور</button>
        </div>
      )}

      {!verified && rec.status !== 'pending' && (
        enabled ? (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void call({ action: 'submit', docType, front, back: docType === 'national_id' ? back : undefined, consent }, 'وصلنا طلب التوثيق') }}>
            {(rec.status === 'rejected' || rec.status === 'revoked') && <p className="rounded-field border border-danger p-3 text-sm" role="alert">{rec.status === 'rejected' ? 'الطلب اترفض' : 'اتلغى التوثيق'}{rec.note ? `: ${rec.note}` : ''}. تقدر تبعت طلب جديد.</p>}
            <Field label="نوع الوثيقة">
              <select className="field" value={docType} onChange={(e) => { setDocType(e.target.value as 'national_id' | 'passport'); setBack(null) }}>
                <option value="national_id">بطاقة رقم قومي</option>
                <option value="passport">جواز سفر</option>
              </select>
            </Field>
            <Field label={docType === 'passport' ? 'صفحة البيانات في الجواز' : 'وجه البطاقة'} hint="صورة واضحة، كل الحواف ظاهرة، بدون انعكاس ضوء">
              <input className="field" type="file" accept="image/*" capture="environment" onChange={(e) => void pick(e.target.files?.[0], setFront)} />
            </Field>
            {docType === 'national_id' && (
              <Field label="ظهر البطاقة">
                <input className="field" type="file" accept="image/*" capture="environment" onChange={(e) => void pick(e.target.files?.[0], setBack)} />
              </Field>
            )}
            {(front || back) && <div className="flex gap-3">{[front, back].map((u, i) => u && <img key={i} src={u} alt="" className="h-24 rounded-field border border-line object-contain" />)}</div>}
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> أوافق إن فريق الموقع يحتفظ بصورة هويتي مشفّرة ويستخدمها للتحقق من شخصيتي بس، وإني أقدر أمسحها في أي وقت.</label>
            <button className="btn-primary" disabled={busy || !ready}>{busy ? '...' : 'أرسل للتوثيق'}</button>
          </form>
        ) : <p className="text-mute" role="status">توثيق الهوية متوقف مؤقتًا.</p>
      )}
    </div>
  )
}
