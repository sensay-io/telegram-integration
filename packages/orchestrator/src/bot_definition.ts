import { config } from '@/config/cluster'
import { z } from 'zod'
import { SensitiveStringSchema } from './config/sensitive_string'

export type ReplicaUUID = string
export type BotToken = string

export const ReplicaUUIDSchema =
  config.isDevelopment || config.isTesting ? z.string() : z.string().uuid()

export const BotDefinitionSchema = z.object({
  replicaUUID: ReplicaUUIDSchema,
  replicaSlug: z.string().optional(),
  ownerUUID: z.string(),
  token: SensitiveStringSchema,
})

export type BotDefinition = z.infer<typeof BotDefinitionSchema>
