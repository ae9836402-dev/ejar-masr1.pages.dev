// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { MAX_IMG_BYTES, badgeOn, checkJpegDataUrl, parseSubmission } from './idverify'
import { jpeg } from '../_tests/jpegFixture'

describe('checkJpegDataUrl', () => {
  it('accepts a real-looking JPEG of a sensible size', () => expect(checkJpegDataUrl(jpeg())).toBeNull())
  it('rejects wrong labels, fake content, tiny and oversized files', () => {
    expect(checkJpegDataUrl(undefined)).not.toBeNull()
    expect(checkJpegDataUrl('data:image/png;base64,AAAA')).not.toBeNull()
    expect(checkJpegDataUrl(jpeg(8000, [0x89, 0x50, 0x4e, 0x47]))).not.toBeNull() // PNG bytes labelled as JPEG
    expect(checkJpegDataUrl(jpeg(100))).not.toBeNull()
    expect(checkJpegDataUrl(jpeg(MAX_IMG_BYTES + 1000))).not.toBeNull()
    expect(checkJpegDataUrl('data:image/jpeg;base64,@@@@')).not.toBeNull()
  })
})

describe('parseSubmission', () => {
  const ok = { consent: true, docType: 'national_id', front: jpeg(), back: jpeg() }
  it('national ID needs consent and both sides; a passport needs the photo page only', () => {
    expect(parseSubmission(ok)).toMatchObject({ docType: 'national_id' })
    expect(parseSubmission({ ...ok, docType: 'passport', back: undefined })).toMatchObject({ docType: 'passport', back: '' })
    expect(typeof parseSubmission({ ...ok, consent: false })).toBe('string')
    expect(typeof parseSubmission({ ...ok, back: undefined })).toBe('string')
    expect(typeof parseSubmission({ ...ok, docType: 'selfie' })).toBe('string')
    expect(typeof parseSubmission({ ...ok, front: 'x' })).toBe('string')
  })
})

describe('badgeOn', () => {
  it('shows only when verified and not hidden by the member', () => {
    expect(badgeOn({ verified: true })).toBe(true)
    expect(badgeOn({ verified: true, badgeHidden: true })).toBe(false)
    expect(badgeOn({ verified: false })).toBe(false)
    expect(badgeOn(null)).toBe(false)
  })
})
