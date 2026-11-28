import type { Env } from './env'
import { commit, getDocument, runQuery } from './firestore'

/**
 * Optional auto-delete of ID photos: settings/idVerification.retentionMonths (0 or missing = keep until an admin or the member deletes them).
 * Called from the daily sweep with a small cap per run; only decided requests are touched, never pending ones.
 */
export async function purgeExpiredIdImages(env: Env, now: Date, max: number): Promise<number> {
  if (max <= 0) return 0
  const s = await getDocument(env, 'settings/idVerification')
  const months = Number(s?.data.retentionMonths) || 0
  if (!(months > 0)) return 0
  const cutoff = now.getTime() - months * 30 * 86_400_000
  const rows = await runQuery(env, { collection: 'idVerifications', where: [{ field: 'hasImages', op: 'EQUAL', value: true }], limit: 50 })
  const old = rows.filter((r) => r.data.status !== 'pending' && r.data.decidedAt instanceof Date && r.data.decidedAt.getTime() < cutoff).slice(0, max)
  for (const r of old) await commit(env, [{ kind: 'delete', path: `idImages/${r.id}` }, { kind: 'upsert', path: `idVerifications/${r.id}`, data: { hasImages: false, purgedAt: now, purgedBy: 'retention' } }])
  return old.length
}
