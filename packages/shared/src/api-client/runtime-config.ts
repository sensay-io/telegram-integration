import assert from 'node:assert'
import { env } from 'node:process'
import type { Client } from '@hey-api/client-fetch'
import type { CreateClientConfig } from './client.gen'

// TODO: Use common config when it's migrated from the orchestrator package
const SENSAY_API_URL = env.SENSAY_API_URL
const SENSAY_API_KEY = env.SENSAY_API_KEY
const VERCEL_PROTECTION_BYPASS = env.VERCEL_PROTECTION_BYPASS
assert(SENSAY_API_URL, 'SENSAY_API_URL is not defined')
assert(SENSAY_API_KEY, 'SENSAY_API_KEY is not defined')

const SENSAY_API_VERSION = '2025-04-01'

export default class SensayApiError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.statusCode = statusCode
  }
}

export type SensayApiErrorResponseBody = {
  success: 'false'
  type: 'object'
  message: string
}

/**
 * Create a client config that will be used by @hey-api/client-fetch generated code to configure the client.
 * @link https://heyapi.dev/openapi-ts/clients/fetch#runtime-api
 * @param config - The base config to extend
 * @returns The client config
 */
export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: SENSAY_API_URL,
  throwOnError: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const configureInterceptors = (client: Client) => {
  client.interceptors.request.use((request) => {
    request.headers.set('X-API-VERSION', SENSAY_API_VERSION)
    request.headers.set('X-ORGANIZATION-SECRET', SENSAY_API_KEY)

    // Bypass Vercel protection for staging
    if (VERCEL_PROTECTION_BYPASS) {
      request.headers.set('X-VERCEL-PROTECTION-BYPASS', VERCEL_PROTECTION_BYPASS)
    }

    return request
  })

  client.interceptors.response.use(async (response, _, options) => {
    if (!response.ok) {
      // TODO: Add Sentry integration
      if (options.throwOnError) {
        let responseBody: SensayApiErrorResponseBody | null = null
        try {
          responseBody = (await response.json()) as SensayApiErrorResponseBody
        } catch {}

        if (responseBody) {
          throw new SensayApiError(responseBody.message, response.status)
        }
        throw new Error(`Sensay API communication error ${response.status}: ${response.statusText}`)
      }
      return response
    }

    return response
  })
}
