import { OpenAPIHono } from '@hono/zod-openapi'
import { ZodError } from 'zod'

export function createRouter() {
  return new OpenAPIHono({
    strict: false,
    defaultHook: (result, _c) => {
      if (!result.success) {
        throw new ZodError(result.error.issues)
      }
    },
  })
}
