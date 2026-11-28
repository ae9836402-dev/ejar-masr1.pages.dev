import { useState } from 'react'
import type { EditorSettings } from '../../functions/_lib/articleEditor'
import { apiPost } from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import { Field } from './ui'

interface Test { ok: boolean; ms: number; provider: string | null; text: string; sources: { title: string; url: string }[] }

/** "قواعد الكتابة والتسويق": standing instructions, the site's real features, verified facts, and optional sourced research. Saved with the automation settings. */
export function ArticleEditorSettings({ value, onChange }: { value: EditorSettings; onChange: (v: EditorSettings) => void }) {
  const toast = useToast()
  const [test, setTest] = useState<Test | null>(null)
  const [busy, setBusy] = useState(false)
  const up = (p: Partial<EditorSettings>) => onChange({ ...value, ...p })

  async function tryResearch() {
    setBusy(true); setTest(null)
    try { setTest(await apiPost<Test>('/api/articles-admin', { action: 'research-test' })) } catch { toast.err('ماقدرناش نجرّب البحث') } finally { setBusy(false) }
  }

  return (
    <fieldset className="panel space-y-5 p-5">
      <legend className="px-1 font-display">قواعد الكتابة والتسويق والمعلومات الموثّقة</legend>

      <Field label="بنود للذكاء الاصطناعي (بتتطبّق على كل المقالات)" hint="كل سطر بند. مثال: اشرح خطوات المعاينة بالتفصيل. اذكر إن التواصل مع المالك مباشر. ما تذكرش أسعار. لو بند طلب رقم أو معلومة مش موثّقة، الكاتب هيتجاهله.">
        <textarea className="field min-h-28" value={value.instructions} maxLength={2000} onChange={(e) => up({ instructions: e.target.value })} />
      </Field>

      <div className="space-y-2">
        <p className="font-medium">مميزات الموقع (الجانب التسويقي)</p>
        <p className="text-sm text-mute">المقال بيذكر ميزة أو اتنين منهم بشكل طبيعي، ويختم بدعوة لخطوة عملية. <b>اكتب هنا مميزات موجودة فعلًا بس</b>، لأن القارئ هيجرّبها.</p>
        {value.features.map((f, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
            <input className="field" aria-label="اسم الميزة" value={f.name} maxLength={40} onChange={(e) => up({ features: value.features.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <input className="field" aria-label="وصف الميزة" value={f.text} maxLength={160} onChange={(e) => up({ features: value.features.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
            <button type="button" className="btn-ghost text-danger" onClick={() => up({ features: value.features.filter((_, j) => j !== i) })}>حذف</button>
          </div>
        ))}
        {value.features.length < 12 && <button type="button" className="btn-ghost" onClick={() => up({ features: [...value.features, { name: '', text: '' }] })}>+ ميزة</button>}
      </div>

      <div className="space-y-2">
        <p className="font-medium">مكتبة الحقائق المعتمدة</p>
        <p className="text-sm text-mute">معلومات إنت متأكد منها (شروط، إجراءات، أرقام رسمية مع مصدرها). دي <b>الوحيدة المسموح بيها من خارج بيانات الموقع</b>. سطر لكل حقيقة.</p>
        <textarea className="field min-h-28" aria-label="الحقائق المعتمدة، كل حقيقة في سطر" value={value.facts.join('\n')} onChange={(e) => up({ facts: e.target.value.split('\n').slice(0, 40) })} placeholder={'مثال: أي حقيقة موثّقة مع مصدرها'} />
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-3"><input type="checkbox" checked={value.research} onChange={(e) => up({ research: e.target.checked })} /><span>بحث بمصادر قبل الكتابة (جوجل عن طريق Gemini)</span></label>
        <p className="text-sm text-mute">بيجيب معلومات خارجية <b>مع روابط مصادرها</b> وبيطبعها في آخر المقال. بيزوّد 15–20 ثانية لكل مقال، ولو ما رجّعش مصادر بيتتجاهل. <b>جرّبه الأول قبل ما تفعّله</b>، لأنه بيشتغل بس مع مفتاح Gemini.</p>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => void tryResearch()}>{busy ? 'بيجرّب (لحد 25 ثانية)…' : 'جرّب البحث الآن'}</button>
        {test && (test.ok
          ? <div className="rounded-field border border-nile p-3 text-sm"><p className="text-nile">اشتغل في {(test.ms / 1000).toFixed(1)} ثانية، ومعاه {test.sources.length} مصدر.</p><p className="mt-1 whitespace-pre-wrap text-mute">{test.text.slice(0, 500)}…</p><ul className="mt-1 list-inside list-disc" dir="ltr">{test.sources.slice(0, 4).map((s) => <li key={s.url}>{s.title}</li>)}</ul></div>
          : <p className="text-sm text-danger" role="alert">{test.provider === 'gemini' ? 'ما رجّعش نتيجة بمصادر (الموديل أو المفتاح أو الحصة). المقالات هتتكتب من غير بحث.' : 'البحث بيشتغل مع Gemini بس. المزوّد الحالي مختلف أو مش مضبوط.'}</p>)}
      </div>
    </fieldset>
  )
}
