import { process } from '@/types/process'
import { z } from 'zod'
import { config as commonConfig, envSchema as commonEnvSchema } from './common'
import { Environment } from './environment'
import { SensitiveStringSchema } from './sensitive_string'

const envSchema = z
  .object({
    BOT_TOKEN: SensitiveStringSchema,
    REPLICA_UUID: z.string(),
    REPLICA_SLUG: z.string().optional(),
    OWNER_ID: z.string(),
    SENSAY_API_URL: z.string(),
    SENSAY_API_KEY: z.string(),
    VERCEL_PROTECTION_BYPASS_KEY: z.string(),
    OPENAI_API_KEY: SensitiveStringSchema,
    ELEVENLABS_API_KEY: SensitiveStringSchema,
    SENTRY_TRACE_HEADER: z.string().optional(),
    SENTRY_BAGGAGE_HEADER: z.string().optional(),
  })
  .extend(commonEnvSchema.shape)

export type Env = z.infer<typeof envSchema>

function createConfig() {
  const parsed = envSchema.safeParse(process.env)

  const logger = commonConfig.logger

  if (parsed.success) {
    if (parsed.data.NODE_ENV !== Environment.TEST) {
      logger.trace('Environment validation passed:')
      logger.table(
        // Don't print SENTRY_BAGGAGE_HEADER. It messes up the output and is rarely useful.
        Object.entries(parsed.data).filter(([key]) => !key.startsWith('SENTRY_BAGGAGE_HEADER')),
      )
    }
  } else {
    logger.fatal('Environment validation failed:')
    logger.table(parsed.error.issues)
    process.exit(-1)
  }

  const { NODE_ENV, ...data } = parsed.data

  return Object.freeze({
    ...commonConfig,
    ...data,
  })
}

export type WorkerConfig = ReturnType<typeof createConfig>

export const config = createConfig()
