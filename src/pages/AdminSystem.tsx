import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { EMPTY_SYSTEM, normalizeSystem, type SystemSettings } from '../../functions/_lib/systemCore'
import { useToast } from '../contexts/ToastContext'
import { ApiError, apiPost } from '../lib/api'
import { db } from '../lib/firebase'
import { usePageMeta } from '../lib/seo'
import { Field, Spinner } from '../components/ui'

interface Health { ai: boolean; aiProvider: string | null; cron: boolean; idEncryption: boolean; indexNow: boolean; paymob: boolean; cloudinary: boolean; email: boolean; siteUrl: boolean }
interface Check { provider: string; model: string; ok: boolean; ms: number; error: string; fallback: { model: string; ok: boolean; ms: number; error: string } | null; models: string[] }
const randomKey = (): string => { const a = new Uint8Array(12); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('') }

/** Settings that are NOT secrets live here (they win over Cloudflare variables). Secrets stay in Cloudflare; this page only shows whether each one is set. */
export default function AdminSystem() {
  usePageMeta({ title: 'الذكاء الاصطناعي والفهرسة', noindex: true })
  const toast = useToast()
  const [s, setS] = useState<SystemSettings | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [check, setCheck] = useState<Check | null>(null)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    void getDoc(doc(db, 'settings', 'system')).then((d) => setS(normalizeSystem(d.exists() ? d.data() : EMPTY_SYSTEM))).catch(() => setS(EMPTY_SYSTEM))
    void apiPost<Health>('/api/admin-health', {}).then(setHealth).catch(() => setHealth(null))
  }, [])
  if (!s) return <Spinner />
  const up = (p: Partial<SystemSettings>) => setS({ ...s, ...p })

  async function save() {
    setBusy('save')
    try { const clean = normalizeSystem(s); await setDoc(doc(db, 'settings', 'system'), clean); setS(clean); toast.ok('اتحفظ. بيسري خلال نص دقيقة تقريبًا'); setHealth(await apiPost<Health>('/api/admin-health', {}).catch(() => health)) } catch { toast.err('ماقدرناش نحفظ') } finally { setBusy('') }
  }
  async function test() {
    setBusy('test'); setCheck(null)
    try { setCheck(await apiPost<Check>('/api/articles-admin', { action: 'ai-check' })) } catch (e) { toast.err(e instanceof ApiError ? e.message : 'الفحص فشل') } finally { setBusy('') }
  }
  const dot = (ok: boolean | undefined) => <b className={ok ? 'text-nile' : 'text-danger'}>{ok ? 'موجود' : 'ناقص'}</b>
  const secrets: [string, boolean | undefined, string][] = [
    ['مفتاح الذكاء الاصطناعي (GEMINI_API_KEY أو ANTHROPIC_API_KEY)', health?.ai, 'لازم للمقالات'],
    ['CRON_SECRET', health?.cron, 'لتشغيل المقالات والفحص اليومي تلقائيًا (GitHub Actions)'],
    ['ID_ENC_KEY', health?.idEncryption, 'لتشفير صور الهوية. من غيره التوثيق مقفول'],
    ['مفاتيح Paymob (4 متغيرات)', health?.paymob, 'للدفع الإلكتروني'],
    ['مفاتيح Cloudinary (3 متغيرات)', health?.cloudinary, 'لرفع الصور'],
    ['RESEND_API_KEY', health?.email, 'لإيميلات الإشعارات'],
    ['SITE_URL', health?.siteUrl, 'عنوان الموقع'],
  ]

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">الذكاء الاصطناعي والفهرسة</h1>
      <section className="panel space-y-4 p-5">
        <h2 className="text-lg font-semibold">الذكاء الاصطناعي</h2>
        <p className="text-sm text-mute">اللي بتكتبه هنا بيتغلّب على متغيرات Cloudflare. سيبه فاضي عشان يستخدم الإعداد الأصلي.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الموديل الأساسي" hint="مثال: gemini-2.5-flash"><input className="field" dir="ltr" list="ai-models" value={s.aiModel} onChange={(e) => up({ aiModel: e.target.value })} /></Field>
          <Field label="الموديل الاحتياطي" hint="بيكمّل الكتابة لو الأساسي بطيء أو زحمة"><input className="field" dir="ltr" list="ai-models" value={s.aiFallbackModel} onChange={(e) => up({ aiFallbackModel: e.target.value })} /></Field>
          <Field label="موديل البحث بمصادر" hint="الافتراضي gemini-2.5-flash"><input className="field" dir="ltr" list="ai-models" value={s.aiResearchModel} onChange={(e) => up({ aiResearchModel: e.target.value })} /></Field>
          <Field label="مستوى التفكير" hint="0 للموديلات 2.5. minimal/low للجيل الأحدث. الافتراضي = سيبه فاضي">
            <select className="field" value={s.aiThinking} onChange={(e) => up({ aiThinking: e.target.value })}>{['', '0', 'minimal', 'low', 'medium', 'high'].map((v) => <option key={v} value={v}>{v === '' ? 'الافتراضي' : v}</option>)}</select>
          </Field>
          <Field label="مهلة الانتظار بالثواني (0 = الافتراضي)" hint="من 20 لـ 280. لو حددتها، مفيش تقسيم للمهلة مع الموديل الاحتياطي"><input className="field" type="number" min={0} max={280} value={s.aiTimeoutSeconds} onChange={(e) => up({ aiTimeoutSeconds: Number(e.target.value) || 0 })} /></Field>
        </div>
        <datalist id="ai-models">{(check?.models ?? []).map((m) => <option key={m} value={m} />)}</datalist>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" disabled={busy === 'save'} onClick={() => void save()}>حفظ</button>
          <button type="button" className="btn-ghost" disabled={busy === 'test'} onClick={() => void test()}>{busy === 'test' ? 'بيختبر (لحد 30 ثانية)…' : 'اختبر الاتصال (بعد الحفظ)'}</button>
        </div>
        {check && (
          <div className="rounded-field border border-line p-3 text-sm" role="status">
            <p>المزوّد: <b>{check.provider}</b> · الموديل: <b dir="ltr">{check.model}</b> · {check.ok ? <span className="text-nile">رد في {(check.ms / 1000).toFixed(1)} ثانية</span> : <span className="text-danger">{check.error}</span>}</p>
            {check.fallback && <p className="mt-1">{check.fallback.ok ? `الاحتياطي ${check.fallback.model} شغّال (${(check.fallback.ms / 1000).toFixed(1)} ثانية)، والكتابة بتتحوّل له تلقائيًا.` : `الاحتياطي ${check.fallback.model} فشل كمان: ${check.fallback.error}`}</p>}
            {check.models.length > 0 && <p className="mt-1 text-mute">موديلات مفتاحك: بتظهر كاقتراحات في الخانات فوق.</p>}
          </div>
        )}
      </section>
      <section className="panel space-y-3 p-5">
        <h2 className="text-lg font-semibold">الفهرسة (IndexNow)</h2>
        <Field label="مفتاح IndexNow" hint="مش سرّي: بيظهر علنًا في /indexnow-key.txt. بيبلّغ Bing وYandex فورًا لما مقال يتنشر.">
          <div className="flex gap-2"><input className="field" dir="ltr" value={s.indexNowKey} onChange={(e) => up({ indexNowKey: e.target.value })} /><button type="button" className="btn-ghost" onClick={() => up({ indexNowKey: randomKey() })}>ولّد مفتاح</button></div>
        </Field>
        <button type="button" className="btn-primary" disabled={busy === 'save'} onClick={() => void save()}>حفظ</button>
      </section>
      <section className="panel space-y-3 p-5">
        <h2 className="text-lg font-semibold">الأسرار (بتفضل في Cloudflare)</h2>
        <p className="text-sm text-mute">دي ما بتتكتبش في اللوحة عن قصد: لو حد اخترق حساب أدمن هيشوفها. هنا بتشوف بس هي موجودة ولا لأ.</p>
        <ul className="divide-y divide-line text-sm">{secrets.map(([n, ok, why]) => <li key={n} className="flex flex-wrap items-center gap-2 py-2"><span className="min-w-0 flex-1" dir="auto">{n}<span className="block text-xs text-mute">{why}</span></span>{health ? dot(ok) : <span className="text-mute">…</span>}</li>)}</ul>
      </section>
    </div>
  )
}
