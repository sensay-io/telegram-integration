import { createRouter } from '@/api/router'
import { BotDefinitionSchema } from '@/bot_definition'
import type { Orchestrator } from '@/orchestrator'
import { type OpenAPIHono, type RouteHandler, createRoute } from '@hono/zod-openapi'
import { HTTPStatusCodes, commonErrorResponses } from './common'

export const tags = ['Bots']

const route = createRoute({
  path: '/bots',
  method: 'post',
  tags,
  request: {
    body: {
      content: {
        'application/json': {
          schema: BotDefinitionSchema,
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
  },
  summary: 'Add a Bot',
  description: 'Add a Bot to the orchestrator.',
  'x-beta': true,
})

export function botsPOST(orchestrator: Orchestrator): OpenAPIHono {
  const handler: RouteHandler<typeof route> = async (c) => {
    const parseResult = BotDefinitionSchema.safeParse(await c.req.json())
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

    await orchestrator.addBot(botDefinition)

    return c.json(null, HTTPStatusCodes.CREATED, {
      Location: `/bots/${botDefinition.replicaUUID}`,
    })
  }

  return createRouter().openapi(route, handler)
}
