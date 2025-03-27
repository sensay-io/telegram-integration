import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { SensitiveString } from './sensitive_string'

describe('SensitiveString', () => {
  it('should return the sensitive value', () => {
    const sensitiveString = new SensitiveString('secret')
    expect(sensitiveString.getSensitiveValue()).toBe('secret')
  })

  it('should return the same value when toString is called', () => {
    const sensitiveString = new SensitiveString('secret')
    expect(sensitiveString.toString()).toBe(SensitiveString.SENSITIVE_STRING_REPLACEMENT)
  })

  it('should return the same value when valueOf is called', () => {
    const sensitiveString = new SensitiveString('secret')
    expect(sensitiveString.valueOf()).toBe(SensitiveString.SENSITIVE_STRING_REPLACEMENT)
  })

  it('should return the same value when inspect is called', () => {
    const sensitiveString = new SensitiveString('secret')
    expect(inspect(sensitiveString)).toBe(SensitiveString.SENSITIVE_STRING_REPLACEMENT)
  })
})
