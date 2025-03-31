import { z } from 'zod'
import { ReplicaUUIDSchema } from './bot_definition'
import { chaosTest } from './utils/chaos'

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
  telegram_integration: z.object({
    token: z.string(),
  }),
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

  async getReplicas({ intergration }: GetReplicasParams): Promise<Replica[]> {
    const url = new URL(`${this.baseURL}/v1/replicas`)

    if (intergration) {
      url.searchParams.set('intergrations', intergration.toString())
    }

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
        'X-API-Version': '2025-02-01',
      },
    })

    if (!response.ok) {
      throw new SensayAPIError({ message: response.statusText, response })
    }

    const parsedResponse = createSensayAPIReponseSchema(responseSchema).safeParse(
      await response.json(),
    )

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
    telegram_integration: {
      token: `test-${i + 1}`,
    },
  }))
}

const fakeReplicas = generateFakeReplicas(10)

export class FakeSensayAPIClient implements SensayAPI {
  private readonly replicas: Replica[]

  constructor({ replicas = fakeReplicas } = {}) {
    this.replicas = replicas
  }

  getReplicas(): Promise<Replica[]> {
    return Promise.resolve(this.replicas)
  }
}
