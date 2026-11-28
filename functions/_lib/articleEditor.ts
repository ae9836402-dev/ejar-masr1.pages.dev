/**
 * Editor-controlled inputs to article writing (all editable by the admin in the panel):
 *  - instructions: standing rules ("بنود") the AI must follow in every article, plus optional per-article rules;
 *  - features: the site's real features, mentioned naturally 1-2 times for marketing and ending with a call to action;
 *  - facts: a library of VERIFIED facts the writer may use (the only outside facts allowed besides cited research);
 *  - research: optionally ask Google Search (through Gemini) for sourced facts and print the sources at the end of the article.
 * Pure helpers (no network) so they are easy to test.
 */
import type { Facts } from './articleAI'

export interface Feature { name: string; text: string }
export interface EditorSettings { instructions: string; features: Feature[]; facts: string[]; research: boolean }
export interface Research { text: string; sources: { title: string; url: string }[] }

/** Only features the site really has today (checked against the code). The admin edits this list in the panel. */
export const DEFAULT_FEATURES: Feature[] = [
  { name: 'تواصل مباشر', text: 'بتتواصل مع المالك أو السمسار مباشرة من صفحة الإعلان' },
  { name: 'بحث واضح', text: 'بحث بالمحافظة والمنطقة والنوع والسعر، وتشوف موقع الوحدة على الخريطة' },
  { name: 'مقارنة ومفضلة', text: 'قارن بين الوحدات واحفظ المفضلة والبحث' },
  { name: 'معلنين موثّقين', text: 'شارة «موثّق» للمعلنين اللي وثّقوا هويتهم' },
  { name: 'دفع إلكتروني', text: 'تقدر تدفع الإيجار والتأمين أونلاين من خلال الموقع' },
]
export const DEFAULT_EDITOR: EditorSettings = { instructions: '', features: DEFAULT_FEATURES, facts: [], research: false }

const oneLine = (v: unknown, n: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '')

export function normalizeEditor(raw: unknown): EditorSettings {
  const o = (raw ?? null) as Record<string, unknown> | null
  if (!o) return DEFAULT_EDITOR
  const features = (Array.isArray(o.features) ? o.features : DEFAULT_FEATURES).flatMap((f): Feature[] => {
    const x = (f ?? {}) as Record<string, unknown>
    const name = oneLine(x.name, 40); const text = oneLine(x.text, 160)
    return name && text ? [{ name, text }] : []
  }).slice(0, 12)
  const facts = (Array.isArray(o.facts) ? o.facts : []).map((s) => oneLine(s, 240)).filter((s) => s.length >= 8).slice(0, 40)
  const instructions = typeof o.instructions === 'string' ? o.instructions.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/g, '').trim().slice(0, 2000) : ''
  return { instructions, features, facts, research: o.research === true }
}

/** The extra block of the writer prompt. Rules about accuracy come LAST so they outrank an editor instruction that asks for something unverifiable. */
export function editorBlock(e: EditorSettings, perArticle: string, research: Research | null): string {
  const parts: string[] = []
  const rules = [e.instructions.trim(), perArticle.trim()].filter(Boolean)
  if (rules.length) parts.push(`بنود إلزامية من المحرر (نفّذها كلها في المقال):\n${rules.map((r) => r.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => `- ${l}`).join('\n')).join('\n')}`)
  if (e.features.length) parts.push(`مميزات الموقع الحقيقية (للتسويق الطبيعي): اذكر ميزة أو ميزتين فقط، داخل سياق فقرة تخدم القارئ، مش كإعلان مباشر ولا في أكتر من موضعين. وفي الخاتمة دعوة قصيرة لخطوة عملية (دوّر على وحدتك على الموقع). ممنوع تذكر أي ميزة مش في القايمة دي:\n${e.features.map((f) => `- ${f.name}: ${f.text}`).join('\n')}`)
  if (e.facts.length) parts.push(`حقائق معتمدة من إدارة الموقع (يجوز استخدامها كما هي من غير تحريف، وهي مع «نتائج البحث» الوحيدة المسموح بها من خارج «بيانات الموقع»):\n${e.facts.map((f) => `- ${f}`).join('\n')}`)
  if (research) parts.push(`نتائج بحث موثّقة بمصادر (انسب كل معلومة لمصدرها بالاسم، ولا تضيف عليها. لو تعارضت مع «بيانات الموقع» فبيانات الموقع هي الأصح):\n${research.text}`)
  if (parts.length) parts.push('تذكير أخير: لو بند من البنود فوق يطلب رقمًا أو معلومة مش موجودة في «بيانات الموقع» أو «الحقائق المعتمدة» أو «نتائج البحث»، تجاهل الجزء ده واكتب بشكل عام. الدقة أهم من تنفيذ البند.')
  return parts.join('\n\n')
}

/** Numbers/facts the quality checker should treat as "known" (site data + the editor's own inputs). */
export const knownText = (siteFacts: string, e: EditorSettings | null, perArticle: string, research: Research | null): string =>
  [siteFacts, ...(e ? [e.instructions, ...e.facts, ...e.features.map((f) => f.text)] : []), perArticle, research?.text ?? ''].join('\n')

const fmt = (n: number): string => String(Math.round(n))

/**
 * Real numbers from the site's own live listings, written by code (not by the model), with the date. Unique content competitors cannot copy, and it cannot be wrong
 * as of that date. Only when the scope is a governorate with enough monthly-priced ads to mean something.
 */
export function statsBlock(f: Facts, date: string): string | null {
  if (!f.govName || f.inScope < 3 || !f.monthly) return null
  const lines = [
    `## أرقام من إعلانات الموقع (بتاريخ ${date})`, '',
    `- الوحدات المتاحة حاليًا في ${f.govName}: ${f.inScope} وحدة.`,
    `- الإيجار الشهري على الموقع: من ${fmt(f.monthly.min)} إلى ${fmt(f.monthly.max)} جنيه، والوسيط حوالي ${fmt(f.monthly.median)} جنيه.`,
  ]
  if (f.byType.length) lines.push(`- أكتر الأنواع المتاحة: ${f.byType.map((t) => `${t.id} (${t.count})`).join('، ')}.`)
  if (f.areas.length) lines.push(`- أكتر المناطق فيها إعلانات: ${f.areas.map((a) => `${a.name} (${a.count})`).join('، ')}.`)
  lines.push('', 'الأرقام دي من الإعلانات المنشورة على الموقع وقت كتابة المقال، وبتتغير مع الوقت.')
  return lines.join('\n')
}

/** Puts a block before the first "## " heading (right after the intro), or at the end if there is none. */
export function insertBeforeFirstSection(body: string, block: string): string {
  const i = body.search(/^##\s/m)
  return i > 0 ? `${body.slice(0, i).trimEnd()}\n\n${block}\n\n${body.slice(i)}` : `${body.trimEnd()}\n\n${block}\n`
}

const safeHttps = (u: string): boolean => { try { return new URL(u).protocol === 'https:' } catch { return false } }
/** "## المصادر" with the sources the research actually returned (never invented). */
export function sourcesBlock(r: Research | null): string | null {
  const src = (r?.sources ?? []).filter((s) => safeHttps(s.url)).slice(0, 8)
  if (!src.length) return null
  return `## المصادر\n\n${src.map((s) => `- [${oneLine(s.title, 80).replace(/[\[\]()]/g, '') || 'مصدر'}](${s.url})`).join('\n')}`
}
