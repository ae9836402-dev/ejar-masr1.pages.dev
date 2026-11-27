/**
 * Ejar Masr emblem: the gold-ringed badge (public/logo.png, a circle on a transparent background).
 * `uid` is kept so existing callers need no change; it is no longer needed because there are no SVG gradient ids to keep unique.
 */
export function Logo({ size = 40, className }: { size?: number; uid?: string; className?: string }) {
  return <img src="/logo.png" alt="إيجار مصر" width={size} height={size} className={className} decoding="async" style={{ width: size, height: size, objectFit: 'contain' }} />
}
