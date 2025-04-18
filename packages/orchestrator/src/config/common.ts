import { env } from 'node:process'
import { Logger, LoggerLevel } from '@/logging/logger'
import { process } from '@/types/process'
import * as Sentry from '@sentry/node'
import { z } from 'zod'
import { Environment } from './environment'

export const envSchema = z.object({
  LOG_LEVEL: z.nativeEnum(LoggerLevel).default(LoggerLevel.INFO),
  NODE_ENV: z.string().optional(),
  SENTRY_DSN: z.string(),
  SENTRY_TRACES_SAMPLERATE: z.coerce.number().min(0).max(1), // TODO: Set it after Pino Sentry initialization
})

export type Env = z.infer<typeof envSchema>

function createConfig() {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    console.error('Environment validation failed:')
    console.table(parsed.error.issues)
    process.exit(-1)
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
    ...data,
    NODE_ENV,
    logger: Logger.create({
      level: data.LOG_LEVEL,
      scope: Sentry.getCurrentScope(),
    }),
    isProduction: NODE_ENV === Environment.PRODUCTION,
    isDevelopment: NODE_ENV === Environment.DEVELOPMENT,
    isTesting: NODE_ENV === Environment.TEST,
    isChaos: NODE_ENV === Environment.CHAOS,
  })
}

export const config = createConfig()
