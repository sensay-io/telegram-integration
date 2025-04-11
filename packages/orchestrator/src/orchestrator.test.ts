import cluster from 'node:cluster'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Logger, LoggerLevel } from './logging/logger'
import { Orchestrator } from './orchestrator'
import { FakeSensayAPIClient } from './sensay_api'

cluster.setupPrimary({
  exec: path.resolve(import.meta.dirname, 'start_worker.ts'),
})

const FAKE_REPLICAS = [
  {
    uuid: '11111111-1111-1111-1111-111111111111',
    name: 'replica-1',
    slug: 'replica-1',
    telegram_integration: { token: 'test_1' },
  },
  {
    uuid: '22222222-2222-2222-2222-222222222222',
    name: 'replica-2',
    slug: 'replica-2',
    telegram_integration: { token: 'test_2' },
  },
  {
    uuid: '33333333-3333-3333-3333-333333333333',
    name: 'replica-3',
    slug: 'replica-3',
    telegram_integration: { token: 'test_3' },
  },
  {
    uuid: '44444444-4444-4444-4444-444444444444',
    name: 'replica-4',
    slug: 'replica-4',
    telegram_integration: { token: 'test_4' },
  },
]

describe('Orchestrator', () => {
  it('should start a worker for each replica', async () => {
    const orchestrator = new Orchestrator({
      api: new FakeSensayAPIClient({ replicas: FAKE_REPLICAS }),
      logger: Logger.create({ level: LoggerLevel.INFO }),
      telegramServiceName: 'sensay-telegram-integrations',
      reloadBotsIntervalMs: 1000,
      printBotsStatusIntervalMs: 1000,
      gracefulShutdownTimeoutMs: 1000,
      healthCheckTimeoutMs: 1000,
      healthCheckIntervalMs: 1000,
      maxFailedStartAttempts: 1,
    })

    await orchestrator.start()

    const status = orchestrator.getStatus()

    expect(status).toEqual([
      {
        replicaUUID: '11111111-1111-1111-1111-111111111111',
        replicaSlug: 'replica-1',
        status: 'running',
      },
      {
        replicaUUID: '22222222-2222-2222-2222-222222222222',
        replicaSlug: 'replica-2',
        status: 'running',
      },
      {
        replicaUUID: '33333333-3333-3333-3333-333333333333',
        replicaSlug: 'replica-3',
        status: 'running',
      },
      {
        replicaUUID: '44444444-4444-4444-4444-444444444444',
        replicaSlug: 'replica-4',
        status: 'running',
      },
    ])
  })
})
