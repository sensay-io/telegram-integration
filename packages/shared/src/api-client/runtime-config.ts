import { config } from '@/config'
import type { Client } from '@hey-api/client-fetch'
import type { CreateClientConfig } from './client.gen'

const SENSAY_API_URL = config.SENSAY_API_URL
const SENSAY_API_KEY = config.SENSAY_API_KEY.getSensitiveValue()
const VERCEL_PROTECTION_BYPASS_KEY = config.VERCEL_PROTECTION_BYPASS_KEY.getSensitiveValue()

const SENSAY_API_VERSION = '2025-04-01'

export class SensayApiError extends Error {
  constructor(
    readonly message: string,
    readonly statusCode: number,
    readonly responseBody?: string,
  ) {
    super(message)
  }

  static async fromResponse(response: Response): Promise<SensayApiError> {
    try {
      const res = response.clone()
      const body = await res.text()
      return new SensayApiError(res.statusText, res.status, body)
    } catch (e) {
      return new SensayApiError(response.statusText, response.status)
    }
  }
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
    if (VERCEL_PROTECTION_BYPASS_KEY) {
      request.headers.set('X-VERCEL-PROTECTION-BYPASS', VERCEL_PROTECTION_BYPASS_KEY)
    }

    return request
  })

  client.interceptors.response.use(async (response, _, options) => {
    if (response.ok) {
      return response
    }

    if (options.throwOnError) {
      const error = await SensayApiError.fromResponse(response)
      config.logger.error(error)
      throw error
    }

    return response
  })
}
