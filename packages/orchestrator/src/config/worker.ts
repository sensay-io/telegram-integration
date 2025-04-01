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
    API_BASE_URL: z.string(),
    SENSAY_ORGANIZATION_SECRET: z.string(),
    VERCEL_PROTECTION_BYPASS_KEY: z.string(),
  })
  .extend(commonEnvSchema.shape)

export type Env = z.infer<typeof envSchema>

function createConfig() {
  const parsed = envSchema.safeParse(process.env)

  if (parsed.success) {
    if (parsed.data.NODE_ENV !== Environment.TEST) {
      console.log('\nEnvironment validation passed:')
      console.table(Object.entries(parsed.data))
      console.log()
    }
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

export type WorkerConfig = ReturnType<typeof createConfig>

export const config = createConfig()
