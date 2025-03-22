// TODO: Use official Sensay API SDK

import { z } from "zod";

class SensayAPIError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly response: Response;
  constructor({ message, response }: { message: string; response: Response }) {
    super(message);
    this.name = "SensayAPIError";
    this.response = response;
    this.status = response.status;
    this.statusText = response.statusText;
    Error.captureStackTrace(this, SensayAPIError);
  }
}

const createSensayAPIReponseSchema = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
) => createSuccessResponseSchema(schema).or(createErrorResponseSchema());

const createSuccessResponseSchema = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
) =>
  schema.extend({
    success: z.literal(true),
  });

const createErrorResponseSchema = () =>
  z.object({
    success: z.literal(false),
    error: z.string(),
    fingerprint: z.string(),
    request_id: z.string(),
  });

const ReplicaSchema = z.object({
  uuid: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
});

export type Replica = z.infer<typeof ReplicaSchema>;

const TelegramBotSchema = z.object({
  id: z.number(),
  token: z.string(),
  mention: z.string(),
});

export type TelegramBot = z.infer<typeof TelegramBotSchema>;

export class SensayAPI {
  constructor(
    private readonly baseURL: string,
    private readonly apiKey: string,
  ) {}

  async getReplicas({
    intergrations,
  }: {
    // TODO: Add support for comma separated values
    intergrations?: "telegram" | "discord";
  }): Promise<Replica[]> {
    const url = new URL(`${this.baseURL}/v1/replicas`);

    if (intergrations) {
      url.searchParams.set("intergrations", intergrations);
    }

    const response = await this.get(
      url,
      z.object({
        items: ReplicaSchema.array(),
      }),
    );

    return response.items;
  }

  async getTelegramBots({
    replicaUUID,
  }: {
    replicaUUID: string;
  }): Promise<TelegramBot[]> {
    const url = new URL(
      `${this.baseURL}/v1/replicas/${replicaUUID}/telegram-bots`,
    );

    const response = await this.get(
      url,
      z.object({
        items: TelegramBotSchema.array(),
      }),
    );

    return response.items;
  }

  private async get<TSchema extends z.ZodRawShape>(
    url: URL,
    responseSchema: z.ZodObject<TSchema>,
  ): Promise<z.infer<typeof responseSchema>> {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Sensay-Bot-Orchestrator",
        "X-Organization-Secret": this.apiKey,
        "X-API-Version": "2025-02-01",
      },
    });

    if (!response.ok) {
      throw new SensayAPIError({ message: response.statusText, response });
    }

    const parsedResponse = createSensayAPIReponseSchema(
      responseSchema,
    ).safeParse(await response.json());

    if (!parsedResponse.success) {
      throw parsedResponse.error;
    }

    if (!parsedResponse.data.success) {
      throw new SensayAPIError({
        message: parsedResponse.data.error,
        response,
      });
    }
    return parsedResponse.data as z.infer<z.ZodObject<TSchema>>;
  }
}

export class FakeSensayAPI extends SensayAPI {
  getReplicas(): Promise<Replica[]> {
    return Promise.resolve([
      {
        uuid: "1",
        name: "Replica 1",
        slug: "replica-1",
      },
      {
        uuid: "2",
        name: "Replica 2",
        slug: "replica-2",
      },
      {
        uuid: "3",
        name: "Replica 3",
        slug: "replica-3",
      },
    ]);
  }

  getTelegramBots({
    replicaUUID,
  }: { replicaUUID: string }): Promise<TelegramBot[]> {
    const tokens = {
      "1": [
        { id: 1, token: "test_1_1", mention: "@replica-1-1" },
        { id: 2, token: "test_1_2", mention: "@replica-1-2" },
      ],
      "2": [
        { id: 1, token: "test_2_1", mention: "@replica-2-1" },
        { id: 2, token: "test_2_2", mention: "@replica-2-2" },
      ],
      "3": [
        { id: 1, token: "test_3_1", mention: "@replica-3-1" },
        { id: 2, token: "test_3_2", mention: "@replica-3-2" },
      ],
    };

    return Promise.resolve(tokens[replicaUUID as keyof typeof tokens]);
  }
}
