import { createServer } from 'node:http'
import type { Logger } from '@/logging/logger'
import type { Orchestrator } from '@/orchestrator'
import { type ServerType, createAdaptorServer } from '@hono/node-server'
import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { HTTPException } from 'hono/http-exception'
import { prettyJSON } from 'hono/pretty-json'
import { botsDELETE } from './bots/bots_delete'
import { botsPOST } from './bots/bots_post'
import { botsPUT } from './bots/bots_put'

const noopMiddleware: MiddlewareHandler = (c, next) => next()

const API_TITLE = 'Sensay Telegram Bot Orchestrator'
const API_VERSION = '2025-04-01'  // TODO: MICHELE: discuss

export type OrchestratorAPIConfig = {
  authToken?: string
  httpPort: number
  logger: Logger
}

/**
 * Orchestrator API is exposing endpoints for CRUD operations on the bots and some service endpoints:
 * - GET /health - get the health of the orchestrator
 * - GET /status - get the status of the orchestrator
 * - POST /bots - create a new bot
 * - PUT /bots/:replicaUUID - update a bot
 * - DELETE /bots/:replicaUUID - delete a bot
 */
export class OrchestratorAPI {
  private readonly httpServer: ServerType
  private readonly logger: Logger

  constructor(
    private readonly orchestrator: Orchestrator,
    private readonly config: OrchestratorAPIConfig,
  ) {
    this.logger = this.config.logger.child({
      module: OrchestratorAPI.name,
    })

    this.httpServer = this.createHTTPServer()
  }

  start() {
    this.httpServer.listen(this.config.httpPort, () => {
      this.logger.info(`Server is running on http://localhost:${this.config.httpPort}`)
    })
  }

  async stop() {
    this.logger.trace('Stopping HTTP server')

    if (!this.httpServer.listening) {
      return
    }

    return new Promise<void>((resolve, reject) => {
      this.httpServer.close((err) => {
        if (err) {
          this.logger.error(err, 'HTTP server closed with error')
          reject(err)
          return
        }

        resolve()
      })
    })
  }

  private createHTTPServer() {
    const app = new OpenAPIHono()

    const auth = this.config.authToken
      ? bearerAuth({ token: this.config.authToken })
      : noopMiddleware

    app.use('/bots', auth)

    app.use(prettyJSON())

    app.onError((err, c) => {
      this.logger.error(err, 'Error in HTTP request')
      if (err instanceof HTTPException) {
        return c.json({ error: err.message }, err.status)
      }

      return c.json({ error: 'Internal Server Error' }, 500)
    })

    app.get('/', (c) =>
      c.html(
        `<h1>${API_TITLE}</h1>
        <ul>
          <li><a href='/ui'>Swagger</a></li>
          <li><a href='/schema'>Schema</a></li>
          <li><a href='/health?pretty'>Health</a></li>
          <li><a href='/status?pretty'>Status</a></li>
        </ul>
        `,
      ),
    )

    const bearerAuthSchemeName = 'BearerAuth'

    app.doc31('/schema', () => ({
      openapi: '3.0.0',
      info: {
        title: API_TITLE,
        version: API_VERSION,
      },
      security: [{ [bearerAuthSchemeName]: [] }],
    }))

    app.openAPIRegistry.registerComponent('securitySchemes', bearerAuthSchemeName, {
      type: 'http',
      scheme: bearerAuthSchemeName,
      in: 'header',
      name: 'Authorization',
      description: 'Bearer token',
    })

    app.get('/ui', swaggerUI({ url: '/schema' }))

    app.get('/health', (c) =>
      c.json({
        status: this.orchestrator.isHealthy() ? 'healthy' : 'unhealthy',
        uptime: process.uptime(),
      }),
    )

    app.get('/status', (c) => c.json(this.orchestrator.getStatus()))

    app.route('/', botsPOST(this.orchestrator))
    app.route('/', botsPUT(this.orchestrator))
    app.route('/', botsDELETE(this.orchestrator))

    return createAdaptorServer({
      fetch: app.fetch,
      port: this.config.httpPort,
      createServer: createServer,
      serverOptions: {
        // TODO: Add SSL certificate
      },
    })
  }
}
