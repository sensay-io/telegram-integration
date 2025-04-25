import cluster from 'node:cluster'
import path from 'node:path'
import { Logger, LoggerLevel } from '@sensay/telegram-shared'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setupMocks } from './mocks/sensay-api'
import { Orchestrator } from './orchestrator'

cluster.setupPrimary({
  exec: path.resolve(import.meta.dirname, '../dist/start-worker.js'),
})

const { server, getUser, getReplicas } = setupMocks()

describe('Orchestrator', () => {
  let orchestrator: Orchestrator

  beforeAll(() => {
    server.listen()
  })

  beforeEach(() => {
    orchestrator = new Orchestrator({
      logger: Logger.create({ level: LoggerLevel.INFO }),
      telegramServiceName: 'orchestrator-dev',
      reloadBotsIntervalMs: 30000,
      printBotsStatusIntervalMs: 10000,
      gracefulShutdownTimeoutMs: 3000,
      healthCheckTimeoutMs: 3000,
      healthCheckIntervalMs: 10000,
      maxFailedStartAttempts: 5,
    })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  it('should start a worker for each replica', async () => {
    server.use(getUser, getReplicas(3))

    await orchestrator.start()

    const status = orchestrator.getStatus()

    expect(status).toEqual([
      {
        replicaUUID: '00000000-0000-0000-0000-000000000000',
        replicaSlug: 'replica-0',
        ownerUUID: 'owner-0',
        status: 'running',
        pid: expect.any(Number),
      },
      {
        replicaUUID: '11111111-1111-1111-1111-111111111111',
        replicaSlug: 'replica-1',
        ownerUUID: 'owner-1',
        status: 'running',
        pid: expect.any(Number),
      },
      {
        replicaUUID: '22222222-2222-2222-2222-222222222222',
        replicaSlug: 'replica-2',
        ownerUUID: 'owner-2',
        status: 'running',
        pid: expect.any(Number),
      },
    ])
  })
})
