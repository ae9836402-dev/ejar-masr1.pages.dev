/**
 * Identity verification: an owner/broker sends a photo of an ID, an admin checks it, and the account gets the "verified" badge.
 * Privacy by design: the photos live ONLY in `idImages/{uid}`, which no client can read (not even the owner or an admin: admins view them through
 * /api/id-verify, which records who looked and when), and they are DELETED the moment the admin decides. What stays is the status, the document type and the
 * decision. The number on the ID is never read or stored by the site.
 */
import type { Env } from './env'
import { getDocument } from './firestore'

export const DOC_TYPES = ['national_id', 'passport'] as const
export type DocType = (typeof DOC_TYPES)[number]
/** One photo, after the browser has resized it. Two photos + the base64 overhead must stay under Firestore's 1 MB document limit. */
export const MAX_IMG_BYTES = 300_000
export const MIN_IMG_BYTES = 5_000

/** "data:image/jpeg;base64,..." that really is a JPEG of a sensible size (checks the magic bytes, not just the label). */
export function checkJpegDataUrl(v: unknown): string | null {
  if (typeof v !== 'string') return 'الصورة مطلوبة'
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(v)
  if (!m) return 'الصورة لازم تكون JPEG'
  if (m[1].length > Math.ceil((MAX_IMG_BYTES * 4) / 3) + 8) return 'الصورة كبيرة. صغّرها وجرّب تاني'
  let bin = ''
  try { bin = atob(m[1]) } catch { return 'الصورة تالفة' }
  if (bin.length > MAX_IMG_BYTES) return 'الصورة كبيرة. صغّرها وجرّب تاني'
  if (bin.length < MIN_IMG_BYTES) return 'الصورة صغيرة أو غير واضحة'
  if (bin.charCodeAt(0) !== 0xff || bin.charCodeAt(1) !== 0xd8 || bin.charCodeAt(2) !== 0xff) return 'الملف مش صورة صحيحة'
  return null
}

export interface Submission { docType: DocType; front: string; back: string }
/** Validates a submit body. National ID needs both sides; a passport needs the photo page only. Returns an Arabic error string if something is wrong. */
export function parseSubmission(b: Record<string, unknown>): Submission | string {
  if (b.consent !== true) return 'لازم توافق على استخدام صورة الهوية للتحقق بس'
  const docType = DOC_TYPES.find((t) => t === b.docType)
  if (!docType) return 'اختار نوع الوثيقة'
  const f = checkJpegDataUrl(b.front); if (f) return `الوجه الأمامي: ${f}`
  let back = ''
  if (docType === 'national_id') { const e = checkJpegDataUrl(b.back); if (e) return `ظهر البطاقة: ${e}`; back = b.back as string }
  return { docType, front: b.front as string, back }
}

let cache: { at: number; enabled: boolean } | null = null
/** Admin switch (settings/idVerification). Off = no new submissions; badges already granted stay. */
export async function idEnabled(env: Env): Promise<boolean> {
  if (cache && Date.now() - cache.at < 30_000) return cache.enabled
  const d = await getDocument(env, 'settings/idVerification')
  cache = { at: Date.now(), enabled: d?.data.enabled !== false }
  return cache.enabled
}
export const resetIdCache = (): void => { cache = null }

/** What the ads show: verified by an admin AND the owner has not chosen to hide the badge. */
export const badgeOn = (u: Record<string, unknown> | null | undefined): boolean => u?.verified === true && u?.badgeHidden !== true
