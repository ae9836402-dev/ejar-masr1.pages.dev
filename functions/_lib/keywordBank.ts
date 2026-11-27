/**
 * A ready-made keyword bank for the article queue: real Egyptian search patterns ("شقق للايجار في مدينة نصر") crossed with the real
 * areas in src/data/locations.json. Each line is a TOPIC; the article planner then asks Google's autocomplete for the exact phrasings people
 * type and picks the primary/related keywords from those, so the bank only decides WHAT to cover and in WHICH ORDER (highest demand first).
 * Pure (no network), so the browser can import it for the admin "add the bank" button.
 */
import locationsRaw from '../../src/data/locations.json'

export interface BankTopic { topic: string; govId: string; typeId: string }
interface Loc { governorates: { id: string; name: string }[]; areas: { id: string; govId: string; name: string }[] }
const LOC = locationsRaw as Loc

/** Areas people search for most, in rough order of demand. Anything not in the dataset is skipped; the rest of the areas follow after these. */
export const PRIORITY_AREAS = [
  'مدينة نصر', 'التجمع الخامس', 'المعادي', 'مدينة الرحاب', 'مدينتي', 'الشروق', 'مصر الجديدة', 'العاصمة الإدارية الجديدة', 'المقطم', 'حلوان', 'عين شمس', 'شبرا', 'القاهرة الجديدة', 'بدر', '15 مايو',
  '6 أكتوبر', 'الشيخ زايد', 'الهرم', 'فيصل', 'المهندسين', 'الدقي', 'العجوزة', 'حدائق الأهرام', 'حدائق أكتوبر', 'إمبابة',
  'سموحة', 'سيدي بشر', 'ميامي', 'العجمي', 'المنتزه', 'برج العرب', 'ستانلي', 'كليوباترا', 'محطة الرمل', 'العصافرة',
  'المنصورة', 'طلخا', 'ميت غمر', 'المنصورة الجديدة', 'منية النصر', 'السنبلاوين', 'دكرنس', 'أجا', 'شربين', 'بلقاس',
  'طنطا', 'المحلة الكبرى', 'الزقازيق', 'العاشر من رمضان', 'بنها', 'شبرا الخيمة', 'العبور', 'قليوب',
  'الغردقة', 'شرم الشيخ', 'مرسى مطروح', 'العلمين', 'الساحل الشمالي', 'مارينا', 'دهب',
]

/** Same search intent, different words people actually use. */
const AREA_PATTERNS = [
  (a: string) => `شقق للايجار في ${a}`,
  (a: string) => `شقق مفروشة للايجار في ${a}`,
  (a: string) => `سكن طلاب وشباب في ${a}`,
]
const GOV_PATTERNS = [
  (g: string) => `ايجار شقة للعرسان في ${g}`,
  (g: string) => `ايجار شقة مفروشة في ${g}`,
  (g: string) => `ايجار شقة رخيصة في ${g}`,
  (g: string) => `سكن طلاب في ${g}`,
  (g: string) => `ايجار محل تجاري في ${g}`,
]
/** Governorates with the most search volume get the extra patterns first. */
const BIG_GOVS = ['القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'الشرقية', 'الغربية', 'القليوبية', 'البحر الأحمر', 'مطروح', 'جنوب سيناء']

const norm = (s: string): string => s.replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim()

/**
 * The bank, most valuable first: (1) plain "شقق للايجار في <area>" for the priority areas, (2) the extra patterns for the big governorates,
 * (3) furnished + student patterns for the priority areas, (4) plain pattern for every other area. Names that exist in two governorates
 * (e.g. المطرية) get the governorate added so the two articles do not compete for the same phrase.
 */
export function keywordBank(): BankTopic[] {
  const govName = new Map(LOC.governorates.map((g) => [g.id, g.name]))
  const govByName = new Map(LOC.governorates.map((g) => [g.name, g.id]))
  const counts = new Map<string, number>()
  for (const a of LOC.areas) counts.set(a.name, (counts.get(a.name) ?? 0) + 1)
  const label = (a: { name: string; govId: string }): string => ((counts.get(a.name) ?? 0) > 1 ? `${a.name} ${govName.get(a.govId) ?? ''}`.trim() : a.name)

  const byName = new Map(LOC.areas.map((a) => [a.name, a]))
  const priority = PRIORITY_AREAS.flatMap((n) => (byName.has(n) ? [byName.get(n)!] : []))
  const prioritySet = new Set(priority.map((a) => a.id))
  const rest = LOC.areas.filter((a) => !prioritySet.has(a.id))

  const out: BankTopic[] = []
  const seen = new Set<string>()
  const add = (topic: string, govId: string): void => { const k = norm(topic); if (!seen.has(k)) { seen.add(k); out.push({ topic, govId, typeId: '' }) } }

  for (const a of priority) add(AREA_PATTERNS[0](label(a)), a.govId)
  for (const gName of BIG_GOVS) { const id = govByName.get(gName); if (id) for (const p of GOV_PATTERNS) add(p(gName), id) }
  for (const a of priority) for (const p of AREA_PATTERNS.slice(1)) add(p(label(a)), a.govId)
  for (const a of rest) add(AREA_PATTERNS[0](label(a)), a.govId)
  for (const g of LOC.governorates) if (!BIG_GOVS.includes(g.name)) for (const p of GOV_PATTERNS.slice(0, 2)) add(p(g.name), g.id)
  return out
}

/** The bank minus what is already in the queue (compared ignoring hamza/ya/ta-marbuta spelling), capped at `room`. */
export function newBankTopics(existing: { topic: string }[], room: number): BankTopic[] {
  const have = new Set(existing.map((t) => norm(t.topic)))
  return keywordBank().filter((t) => !have.has(norm(t.topic))).slice(0, Math.max(0, room))
}
