// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Env } from './env'
import { decryptJpegDataUrl, encryptJpegDataUrl, idKeyOk, isEncrypted } from './idcrypto'
import { jpeg } from '../_tests/jpegFixture'

export const TEST_KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i + 7)))
const env = (k: string | null = TEST_KEY): Env => ({ ID_ENC_KEY: k ?? undefined }) as Env

describe('ID photo encryption', () => {
  it('only a 32-byte base64 key is accepted', () => {
    expect(idKeyOk(env())).toBe(true)
    for (const bad of [null, '', 'short', 'x'.repeat(44), TEST_KEY.slice(0, 40)]) expect(idKeyOk(env(bad))).toBe(false)
  })
  it('round-trips a photo, and the stored text is not the photo', async () => {
    const photo = jpeg(20_000)
    const stored = await encryptJpegDataUrl(env(), 'uidAAAAAA1', 'front', photo)
    expect(isEncrypted(stored)).toBe(true)
    expect(stored.includes(photo.slice(40, 120))).toBe(false)
    expect(await decryptJpegDataUrl(env(), 'uidAAAAAA1', 'front', stored)).toBe(photo)
  })
  it('uses a fresh IV each time, and binds the ciphertext to the member and the side', async () => {
    const photo = jpeg(6000)
    const a = await encryptJpegDataUrl(env(), 'uidAAAAAA1', 'front', photo)
    const b = await encryptJpegDataUrl(env(), 'uidAAAAAA1', 'front', photo)
    expect(a).not.toBe(b)
    await expect(decryptJpegDataUrl(env(), 'uidBBBBBB2', 'front', a)).rejects.toThrow() // another member
    await expect(decryptJpegDataUrl(env(), 'uidAAAAAA1', 'back', a)).rejects.toThrow() // another side
  })
  it('refuses a wrong key and tampered data; plain legacy photos pass through', async () => {
    const photo = jpeg(6000)
    const stored = await encryptJpegDataUrl(env(), 'uidAAAAAA1', 'front', photo)
    await expect(decryptJpegDataUrl(env(btoa('B'.repeat(32))), 'uidAAAAAA1', 'front', stored)).rejects.toThrow()
    const [iv, ct] = stored.slice(5).split('.')
    const flipped = `enc1:${iv}.${(ct[10] === 'A' ? 'B' : 'A') === ct[10] ? ct : ct.slice(0, 10) + (ct[10] === 'A' ? 'B' : 'A') + ct.slice(11)}`
    await expect(decryptJpegDataUrl(env(), 'uidAAAAAA1', 'front', flipped)).rejects.toThrow()
    expect(await decryptJpegDataUrl(env(), 'uidAAAAAA1', 'front', photo)).toBe(photo)
  })
})
