import { Logger, LoggerLevel } from '@/logging/logger'
import { process } from '@/types/process'
import { z } from 'zod'
import { Environment } from './environment'

export const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  LOG_LEVEL: z.nativeEnum(LoggerLevel).default(LoggerLevel.INFO),
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

  return Object.freeze({
    ...data,
    NODE_ENV,
    logger: Logger.create({ level: data.LOG_LEVEL }),
    isProduction: NODE_ENV === Environment.PRODUCTION,
    isDevelopment: NODE_ENV === Environment.DEVELOPMENT,
    isTesting: NODE_ENV === Environment.TEST,
    isChaos: NODE_ENV === Environment.CHAOS,
  })
}

export const config = createConfig()
