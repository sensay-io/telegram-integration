import { env } from 'node:process'
import {
  SensitiveStringSchema,
  config as commonConfig,
  envSchema as commonEnvSchema,
  process,
} from '@sensay/telegram-shared'
import * as Sentry from '@sentry/node'
import { z } from 'zod'

const envSchema = z
  .object({
    HTTP_PORT: z.coerce.number().min(1).max(65535).default(3000),
    ORCHESTRATOR_API_KEY: SensitiveStringSchema,
    TELEGRAM_SERVICE_NAME: z.string().default('sensay-telegram-integrations'),
    RELOAD_BOTS_INTERVAL_MS: z.coerce.number().default(5 * 60 * 1000),
    PRINT_BOTS_STATUS_INTERVAL_MS: z.coerce.number().default(60 * 1000),
    HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().default(4000),
    HEALTH_CHECK_INTERVAL_MS: z.coerce.number().default(5000),
    GRACEFUL_SHUTDOWN_TIMEOUT_MS: z.coerce.number().default(1000),
    MAX_FAILED_START_ATTEMPTS: z.coerce.number().default(3),
    OPENAI_API_KEY: SensitiveStringSchema,
  })
  .extend(commonEnvSchema.shape)

async function createConfig() {
  const logger = commonConfig.logger

  const parsed = envSchema.safeParse(process.env)
  if (parsed.success) {
    logger.debug('[Orchestrator] Environment validation passed:')
    logger.table(Object.entries(parsed.data))
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
  Sentry.setContext('Railway', {
    deploymentId: env.RAILWAY_DEPLOYMENT_ID,
    publicDomain: env.RAILWAY_PUBLIC_DOMAIN,
  })
  Sentry.setContext('Git', {
    commitRef: env.RAILWAY_GIT_COMMIT_SHA,
    commitMessage: env.RAILWAY_GIT_COMMIT_MESSAGE,
  })

  return Object.freeze({
    ...commonConfig,
    ...data,
  })
}

export const config = await createConfig()
