import { z } from 'zod'
import { ReplicaUUIDSchema } from './bot_definition'
import { chaosTest } from './utils/chaos'
import dotenv from 'dotenv'
import assert from 'node:assert'

const dotenvOutput = dotenv.config({ path: '.env.local' })

if (dotenvOutput.error) {
  throw dotenvOutput.error
}

assert(dotenvOutput.parsed)
const env = dotenvOutput.parsed

class SensayAPIError extends Error {
  readonly status: number
  readonly statusText: string
  readonly response: Response
  constructor({ message, response }: { message: string; response: Response }) {
    super(message)
    this.name = 'SensayAPIError'
    this.response = response
    this.status = response.status
    this.statusText = response.statusText
    Error.captureStackTrace(this, SensayAPIError)
  }
}

const createSensayAPIReponseSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  createSuccessResponseSchema(schema).or(createErrorResponseSchema())

const createSuccessResponseSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.extend({
    success: z.literal(true),
  })

const createErrorResponseSchema = () =>
  z.object({
    success: z.literal(false),
    error: z.string(),
    fingerprint: z.string(),
    request_id: z.string(),
  })

const ReplicaSchema = z.object({
  uuid: ReplicaUUIDSchema,
  name: z.string(),
  slug: z.string(),
  profile_image: z.string(),
  short_description: z.string(),
  introduction: z.string(),
  tags: z.array(z.string()),
  created_at: z.string(),
  owner_uuid: z.string(),
  voice_enabled: z.boolean(),
  video_enabled: z.boolean(),
  chat_history_count: z.number(),
  system_message: z.string(),
  telegram_service_name: z.string().nullable(),
  discord_service_name: z.string().nullable(),
  discord_is_active: z.boolean().nullable(),
  telegram_integration: z
    .object({
      token: z.string(),
    })
    .nullable(),
  discord_integration: z
    .object({
      token: z.string(),
    })
    .nullable(),
})

export type Replica = z.infer<typeof ReplicaSchema>

export enum Integration {
  TELEGRAM = 'telegram',
  DISCORD = 'discord',
}
export type GetReplicasParams = {
  intergration: Integration
}

export interface SensayAPI {
  getReplicas({ intergration }: GetReplicasParams): Promise<Replica[]>
}

@chaosTest()
export class SensayAPIClient implements SensayAPI {
  constructor(
    private readonly baseURL: string,
    private readonly apiKey: string,
  ) {}

  async getReplicas(): Promise<Replica[]> {
    const url = new URL(`${this.baseURL}/v1/replicas`)

    url.searchParams.set('integration', 'telegram')

    // Specifying a specific owner_uuid so collide we other working replicas from Sensay
    url.searchParams.set('owner_uuid', env.OWNER_UUID)

    const response = await this.get(
      url,
      z.object({
        items: ReplicaSchema.array(),
      }),
    )

    return response?.items ?? []
  }

  private async get<TSchema extends z.ZodRawShape>(
    url: URL,
    responseSchema: z.ZodObject<TSchema>,
  ): Promise<z.infer<typeof responseSchema> | null> {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Sensay-Bot-Orchestrator',
        'X-Organization-Secret': this.apiKey,
        'X-API-Version': '2025-02-01', // TODO: MICHELE: Switch to new version
      },
    })

    if (!response.ok) {
      throw new SensayAPIError({ message: response.statusText, response })
    }

    const replicas = await response.json()

    const parsedResponse = createSensayAPIReponseSchema(responseSchema).safeParse(replicas)

    if (!parsedResponse.success) {
      throw parsedResponse.error
    }

    if (!parsedResponse.data.success) {
      throw new SensayAPIError({
        message: parsedResponse.data.error,
        response,
      })
    }
    return parsedResponse.data as z.infer<z.ZodObject<TSchema>>
  }
}

const generateFakeReplicas = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    uuid: `fake-replica-${i + 1}`,
    name: `Replica ${i + 1}`,
    slug: `replica-${i + 1}`,
    profile_image: `https://example.com/image-${i + 1}.jpg`,
    short_description: 'A test replica',
    introduction: 'This is a test replica',
    tags: ['test'],
    created_at: new Date().toISOString(),
    owner_uuid: `owner-${i + 1}`,
    voice_enabled: false,
    video_enabled: false,
    chat_history_count: 0,
    system_message: 'Test system message',
    telegram_service_name: 'test-service',
    discord_service_name: null,
    discord_is_active: null,
    telegram_integration: {
      token: `test-${i + 1}`,
    },
    discord_integration: null,
  }))
}

const fakeReplicas = generateFakeReplicas(3)

export class FakeSensayAPIClient implements SensayAPI {
  private readonly replicas: Replica[]

  constructor({ replicas = fakeReplicas } = {}) {
    this.replicas = replicas
  }

  getReplicas(): Promise<Replica[]> {
    return Promise.resolve(this.replicas)
  }
}
