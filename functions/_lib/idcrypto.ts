/**
 * Encryption of ID photos at rest (AES-256-GCM, Web Crypto). The key lives ONLY in Cloudflare (secret ID_ENC_KEY, 32 random bytes in base64:
 * `openssl rand -base64 32`), never in the database, so someone who gets a copy of the database sees ciphertext. Each photo gets its own random IV,
 * and the member id + slot are bound in as "additional data", so a ciphertext cannot be moved to another member's record.
 * If the key is ever lost or changed, existing photos cannot be opened again (members would have to resubmit): keep a backup of it.
 */
import type { Env } from './env'

const PREFIX = 'enc1:'
const KEY_RE = /^[A-Za-z0-9+/]{43}=$/
export const idKeyOk = (env: Env): boolean => KEY_RE.test((env.ID_ENC_KEY ?? '').trim())
export const isEncrypted = (v: unknown): v is string => typeof v === 'string' && v.startsWith(PREFIX)

const toB64 = (b: Uint8Array): string => { let s = ''; for (let i = 0; i < b.length; i += 0x4000) s += String.fromCharCode(...b.subarray(i, i + 0x4000)); return btoa(s) }
const fromB64 = (s: string): Uint8Array => { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out }
const aad = (uid: string, slot: string): Uint8Array => new TextEncoder().encode(`${uid}:${slot}`)

let cached: { raw: string; key: CryptoKey } | null = null
async function keyOf(env: Env): Promise<CryptoKey> {
  const raw = (env.ID_ENC_KEY ?? '').trim()
  if (!KEY_RE.test(raw)) throw new Error('ID_ENC_KEY missing or malformed')
  if (cached?.raw === raw) return cached.key
  const key = await crypto.subtle.importKey('raw', fromB64(raw) as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
  cached = { raw, key }
  return key
}

/** "data:image/jpeg;base64,..." -> "enc1:<iv>.<ciphertext>" (the JPEG bytes are encrypted, so the stored size stays about the size of the photo). */
export async function encryptJpegDataUrl(env: Env, uid: string, slot: 'front' | 'back', dataUrl: string): Promise<string> {
  const m = /^data:image\/jpeg;base64,(.+)$/.exec(dataUrl)
  if (!m) throw new Error('not a jpeg data url')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad(uid, slot) as BufferSource }, await keyOf(env), fromB64(m[1]) as BufferSource))
  return `${PREFIX}${toB64(iv)}.${toB64(ct)}`
}

/** Back to a data URL. Photos stored before encryption existed (plain data URLs) are returned as they are. Throws if the key is wrong or the data was tampered with. */
export async function decryptJpegDataUrl(env: Env, uid: string, slot: 'front' | 'back', stored: string): Promise<string> {
  if (!isEncrypted(stored)) return stored
  const [ivB64, ctB64] = stored.slice(PREFIX.length).split('.')
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) as BufferSource, additionalData: aad(uid, slot) as BufferSource }, await keyOf(env), fromB64(ctB64) as BufferSource))
  return `data:image/jpeg;base64,${toB64(pt)}`
}
