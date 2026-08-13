// confirm.test.js — unit tests for createConfirmAdapter
import { describe, it, expect, vi } from 'vitest'
import { createConfirmAdapter } from './confirm.js'

describe('createConfirmAdapter', () => {
  it('returns a function that delegates to windowRef.confirm', () => {
    const fakeWindow = { confirm: vi.fn().mockReturnValue(true) }
    const adapter = createConfirmAdapter(fakeWindow)
    const result = adapter('Are you sure?')
    expect(fakeWindow.confirm).toHaveBeenCalledWith('Are you sure?')
    expect(result).toBe(true)
  })

  it('returns false when windowRef.confirm returns false', () => {
    const fakeWindow = { confirm: vi.fn().mockReturnValue(false) }
    const adapter = createConfirmAdapter(fakeWindow)
    expect(adapter('msg')).toBe(false)
  })

  it('returns undefined when windowRef is missing (fail-open)', () => {
    const adapter = createConfirmAdapter(undefined)
    expect(adapter('msg')).toBeUndefined()
  })

  it('returns undefined when windowRef.confirm is missing (fail-open)', () => {
    const adapter = createConfirmAdapter({})
    expect(adapter('msg')).toBeUndefined()
  })
})
