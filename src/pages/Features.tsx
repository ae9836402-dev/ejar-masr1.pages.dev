import { Link } from 'react-router-dom'
import { FEATURES_DESC, FEATURES_FAQ, FEATURES_INTRO, FEATURES_TITLE, FEATURE_SECTIONS } from '../content/features'
import { usePageMeta } from '../lib/seo'

export default function Features() {
  usePageMeta({ title: FEATURES_TITLE, description: FEATURES_DESC, path: '/features' })
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl">{FEATURES_TITLE}</h1>
      {FEATURES_INTRO.map((p) => <p key={p} className="mt-3 text-mute">{p}</p>)}
      {FEATURE_SECTIONS.map((s) => <section key={s.h2} className="mt-8"><h2 className="text-xl font-semibold">{s.h2}</h2><p className="mt-2">{s.text}</p></section>)}
      <section className="mt-10">
        <h2 className="text-xl font-semibold">أسئلة شائعة</h2>
        {FEATURES_FAQ.map((f) => <details key={f.q} className="panel mt-3 p-4"><summary className="cursor-pointer font-medium">{f.q}</summary><p className="mt-2 text-mute">{f.a}</p></details>)}
      </section>
      <div className="mt-10 flex flex-wrap gap-3"><Link className="btn-primary" to="/search">ابحث عن وحدة للإيجار</Link><Link className="btn-ghost" to="/dashboard/new">أضف وحدتك</Link><Link className="btn-ghost" to="/plans">الباقات</Link></div>
    </div>
  )
}
