import { inspect } from 'node:util'
import { z } from 'zod'

/**
 * A protection against accidental exposure of sensitive information in the logs.
 *
 * @example
 * ```ts
 * const sensitiveString = new SensitiveString('secret')
 * console.log(sensitiveString) // *********
 * console.log(sensitiveString.toString()) // *********
 * console.log(sensitiveString.valueOf()) // *********
 * console.log(inspect(sensitiveString)) // *********
 * console.log(sensitiveString.getSensitiveValue()) // secret
 * ```
 */
export class SensitiveString {
  static readonly SENSITIVE_STRING_REPLACEMENT = '********'

  readonly #value: string

  constructor(value: string) {
    this.#value = value
  }

  getSensitiveValue() {
    return this.#value
  }

  toString() {
    return SensitiveString.SENSITIVE_STRING_REPLACEMENT
  }

  valueOf() {
    return SensitiveString.SENSITIVE_STRING_REPLACEMENT
  }

  [Symbol.toStringTag]() {
    return SensitiveString.SENSITIVE_STRING_REPLACEMENT
  }

  [inspect.custom](): string {
    return SensitiveString.SENSITIVE_STRING_REPLACEMENT
  }
}

export const SensitiveStringSchema = z.string().transform((value) => new SensitiveString(value))
