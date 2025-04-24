import { config } from '@sensay/telegram-shared'
import { SensitiveStringSchema } from '@sensay/telegram-shared'
import { z } from 'zod'

export type ReplicaUUID = string
export type ReplicaSlug = string
export type BotToken = string

export const ReplicaUUIDSchema =
  config.isDevelopment || config.isTesting ? z.string() : z.string().uuid()

export const BotDefinitionSchema = z.object({
  replicaUUID: ReplicaUUIDSchema,
  replicaSlug: z.string(),
  ownerID: z.string(),
  token: SensitiveStringSchema,
  elevenLabsID: z.string().optional(),
})

export type BotDefinition = z.infer<typeof BotDefinitionSchema>
