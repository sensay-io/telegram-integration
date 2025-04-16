import { process } from '@/types/process'
import { z } from 'zod'
import { config as commonConfig, envSchema as commonEnvSchema } from './common'
import { SensitiveStringSchema } from './sensitive_string'

const envSchema = z
  .object({
    HTTP_PORT: z.coerce.number().min(1).max(65535).default(3000),
    ORCHESTRATOR_AUTH_TOKEN: SensitiveStringSchema.optional(),
    SENSAY_API_URL: z.string().url(),
    SENSAY_API_KEY: SensitiveStringSchema,
    VERCEL_PROTECTION_BYPASS_KEY: SensitiveStringSchema,
    RELOAD_BOTS_INTERVAL_MS: z.coerce.number().default(5 * 60 * 1000),
    PRINT_BOTS_STATUS_INTERVAL_MS: z.coerce.number().default(60 * 1000),
    HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().default(1000),
    HEALTH_CHECK_INTERVAL_MS: z.coerce.number().default(5000),
    GRACEFUL_SHUTDOWN_TIMEOUT_MS: z.coerce.number().default(1000),
    MAX_FAILED_RESTARTS: z.coerce.number().default(3),
  })
  .extend(commonEnvSchema.shape)

function createConfig() {
  const parsed = envSchema.safeParse(process.env)

  if (parsed.success) {
    console.log('\nEnvironment validation passed:')
    console.table(Object.entries(parsed.data))
    console.log()
  } else {
    console.error('Environment validation failed:')
    console.table(parsed.error.issues)
    process.exit(-1)
  }

  const { NODE_ENV, ...data } = parsed.data

  return Object.freeze({
    ...commonConfig,
    ...data,
  })
}

export const config = createConfig()
