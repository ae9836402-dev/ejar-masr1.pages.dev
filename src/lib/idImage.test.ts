import { describe, expect, it } from 'vitest'
import { dataUrlBytes, fitSize } from './idImage'

describe('idImage helpers', () => {
  it('fitSize keeps the aspect ratio, never enlarges, and never returns zero', () => {
    expect(fitSize(4000, 3000, 1400)).toEqual({ w: 1400, h: 1050 })
    expect(fitSize(800, 600, 1400)).toEqual({ w: 800, h: 600 })
    expect(fitSize(3000, 1, 600).h).toBe(1)
  })
  it('dataUrlBytes is the decoded size of a base64 data URL', () => {
    expect(dataUrlBytes(`data:image/jpeg;base64,${btoa('x'.repeat(300))}`)).toBe(300)
  })
})
