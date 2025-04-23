import { env } from 'node:process'
import {
  Environment,
  SensitiveStringSchema,
  config as commonConfig,
  envSchema as commonEnvSchema,
  process,
} from '@sensay/telegram-shared'
import * as Sentry from '@sentry/node'
import { z } from 'zod'

const envSchema = z
  .object({
    BOT_TOKEN: SensitiveStringSchema,
    REPLICA_UUID: z.string(),
    REPLICA_SLUG: z.string(),
    OWNER_ID: z.string(),
    OPENAI_API_KEY: SensitiveStringSchema,
    ELEVENLABS_API_KEY: SensitiveStringSchema,
    SENTRY_TRACE_HEADER: z.string().optional(),
    SENTRY_BAGGAGE_HEADER: z.string().optional(),
  })
  .extend(commonEnvSchema.shape)

export type Env = z.infer<typeof envSchema>

async function createConfig() {
  const parsed = envSchema.safeParse(env)

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
    await logger.fatal(parsed.error, 'Environment validation failed:')
    logger.table(parsed.error.issues)
    process.exit(1)
  }

  const { NODE_ENV, ...data } = parsed.data

  Sentry.init({
    dsn: data.SENTRY_DSN,
    tracesSampleRate: data.SENTRY_TRACES_SAMPLERATE,
    environment: env.RAILWAY_ENVIRONMENT_NAME ?? NODE_ENV,
  })

  return Object.freeze({
    ...commonConfig,
    ...data,
  })
}

export type WorkerConfig = ReturnType<typeof createConfig>

export const config = await createConfig()
