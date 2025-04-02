import { createRouter } from '@/api/router'
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
  method: 'delete',
  tags,
  request: {
    params: ReplicaUUIDParameterSchema,
  },
  responses: {
    ...commonErrorResponses,
    [HTTPStatusCodes.NO_CONTENT]: {
      description: 'Bot deleted successfully',
    },
  },
  summary: 'Delete a Bot',
  description: 'Delete a Bot from the orchestrator.',
  'x-beta': true,
})

export function botsDELETE(orchestrator: Orchestrator): OpenAPIHono {
  const handler: RouteHandler<typeof route> = async (c) => {
    const replicaUUID = c.req.param(ReplicaUUIDParameter)

    const result = await orchestrator.deleteBot(replicaUUID)
    switch (result) {
      case BotCRUDOperationResult.Deleted:
        return c.body(null, HTTPStatusCodes.NO_CONTENT)
      case BotCRUDOperationResult.NotFound:
        return c.notFound()
      default:
        assertNever(result)
    }
  }

  return createRouter().openapi(route, handler)
}
