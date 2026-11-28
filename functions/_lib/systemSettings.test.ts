// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Env } from './env'
import { EMPTY_SYSTEM, applySystem, normalizeSystem } from './systemSettings'

describe('system settings (set from the panel)', () => {
  it('keeps only valid values', () => {
    const s = normalizeSystem({ aiModel: ' gemini-2.5-flash ', aiFallbackModel: 'bad model!', aiResearchModel: 'gemini-3.5-flash', aiThinking: 'LOW', aiTimeoutSeconds: 120, indexNowKey: 'abcdef1234567890' })
    expect(s).toEqual({ aiModel: 'gemini-2.5-flash', aiFallbackModel: '', aiResearchModel: 'gemini-3.5-flash', aiThinking: 'low', aiTimeoutSeconds: 120, indexNowKey: 'abcdef1234567890' })
    expect(normalizeSystem({ aiThinking: 'sideways', aiTimeoutSeconds: 5, indexNowKey: 'short' })).toEqual(EMPTY_SYSTEM)
    expect(normalizeSystem(undefined)).toEqual(EMPTY_SYSTEM)
    expect(normalizeSystem({ aiThinking: '0' }).aiThinking).toBe('0')
  })
  it('a panel value wins over Cloudflare; empty leaves Cloudflare\'s value; the original env is not mutated', () => {
    const base = { AI_MODEL: 'cf-model', AI_THINKING: 'low', GEMINI_API_KEY: 'k' } as Env
    const e = applySystem(base, { ...EMPTY_SYSTEM, aiModel: 'panel-model', aiTimeoutSeconds: 90, indexNowKey: 'abcdef1234567890' })
    expect([e.AI_MODEL, e.AI_THINKING, e.AI_TIMEOUT_SECONDS, e.INDEXNOW_KEY, e.GEMINI_API_KEY]).toEqual(['panel-model', 'low', '90', 'abcdef1234567890', 'k'])
    expect(base.AI_MODEL).toBe('cf-model')
    expect(applySystem(base, EMPTY_SYSTEM)).toEqual(base)
  })
})
