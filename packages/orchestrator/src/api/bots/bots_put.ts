import { createRouter } from '@/api/router'
import { BotDefinitionSchema } from '@/bot_definition'
import { BotCRUDOperationResult, type Orchestrator } from '@/orchestrator'
import { assertNever } from '@/types/common'
import { type OpenAPIHono, type RouteHandler, createRoute } from '@hono/zod-openapi'
import {
  HTTPStatusCodes,
  ReplicaUUIDParameter,
  ReplicaUUIDParameterSchema,
  commonErrorResponses,
} from './common'

export const tags = ['Bots']

const route = createRoute({
  path: `/bots/{${ReplicaUUIDParameter}}`,
  method: 'put',
  tags,
  request: {
    params: ReplicaUUIDParameterSchema,
    body: {
      content: {
        'application/json': {
          schema: BotDefinitionSchema.partial(),
        },
      },
    },
  },
  responses: {
    ...commonErrorResponses,
    [HTTPStatusCodes.CREATED]: {
      description: 'Bot added successfully',
      headers: {
        Location: {
          type: 'string',
          description: 'The location of the new Bot',
        },
      },
    },
    [HTTPStatusCodes.NO_CONTENT]: {
      description: 'Bot updated successfully',
    },
  },
  summary: 'Update a Bot',
  description: 'Update a Bot in the orchestrator.',
  'x-beta': true,
})

export function botsPUT(orchestrator: Orchestrator): OpenAPIHono {
  const handler: RouteHandler<typeof route> = async (c) => {
    const replicaUUID = c.req.param(ReplicaUUIDParameter)

    const parseResult = BotDefinitionSchema.partial().safeParse(await c.req.json())
    if (!parseResult.success) {
      return c.json(
        {
          message: 'Invalid bot definition',
          errors: parseResult.error.issues,
          botDefinition: parseResult.data,
        },
        HTTPStatusCodes.BAD_REQUEST,
      )
    }

    const botDefinition = parseResult.data

    const result = await orchestrator.updateBot({
      replicaUUID,
      ...botDefinition,
    })
    switch (result) {
      case BotCRUDOperationResult.Updated:
        return c.body(null, HTTPStatusCodes.NO_CONTENT)
      case BotCRUDOperationResult.Created:
        return c.json(null, HTTPStatusCodes.CREATED, {
          Location: `/bots/${botDefinition.replicaUUID}`,
        })
      case BotCRUDOperationResult.NotFound:
        return c.json(null, HTTPStatusCodes.NOT_FOUND)
      default:
        assertNever(result)
    }
  }

  return createRouter().openapi(route, handler)
}
