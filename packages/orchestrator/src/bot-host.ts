import cluster from 'node:cluster'
import type { Env } from '@sensay/telegram-bot'
import type { Logger, TypedWorker, WorkerEventMap } from '@sensay/telegram-shared'
import { Signal, WorkerEvent } from '@sensay/telegram-shared'
import * as Sentry from '@sentry/node'
import type { BotDefinition } from './bot-definition'
import { BotIPCChannel } from './bot-ipc-channel'
import { config as clusterConfig } from './config'

import { chaosTest } from './utils/chaos'
import { withTimeout } from './utils/timer'

type BotHostConfig = {
  healthCheckTimeoutMs: number
  gracefulShutdownTimeoutMs: number
  logger: Logger
}

/**
 * BotHost runs in the parent process and is responsible for
 * starting the worker process and handling communication with it.
 * Acts as a proxy between the {@link BotSupervisor} and the {@link BotWorker}.
 */
@chaosTest()
export class BotHost {
  private readonly ipcChannel: BotIPCChannel

  constructor(
    botDefinition: BotDefinition,
    private readonly worker: TypedWorker,
    private readonly config: BotHostConfig,
  ) {
    this.ipcChannel = new BotIPCChannel(botDefinition, worker, config.logger)
  }

  get isConnected(): boolean {
    return this.worker?.isConnected()
  }

  get PID(): number | undefined {
    return this.worker?.process.pid
  }

  static async start(botDefinition: BotDefinition, config: BotHostConfig): Promise<BotHost> {
    // TODO: Double check that passing Sentry trace headers to the worker process is needed.
    // It seems like Sentry does this automatically:
    // https://github.com/getsentry/sentry-javascript/blob/3bc192315d73f0e2058c70c46500da738dfe0d32/packages/node/src/sdk/index.ts#L70
    const traceData = Sentry.getTraceData()
    const sentryTraceHeader = traceData['sentry-trace']
    const sentryBaggageHeader = traceData.baggage

    const worker = cluster.fork({
      // Every environment variable is passed as a raw string
      BOT_TOKEN: botDefinition.token.getSensitiveValue(),
      REPLICA_UUID: botDefinition.replicaUUID,
      REPLICA_SLUG: botDefinition.replicaSlug,
      ELEVENLABS_ID: botDefinition.elevenLabsID,
      NODE_ENV: clusterConfig.NODE_ENV,
      LOG_LEVEL: clusterConfig.LOG_LEVEL,
      SENSAY_API_URL: clusterConfig.SENSAY_API_URL,
      SENSAY_API_KEY: clusterConfig.SENSAY_API_KEY.getSensitiveValue(),
      SENTRY_DSN: clusterConfig.SENTRY_DSN,
      SENTRY_TRACES_SAMPLERATE: clusterConfig.SENTRY_TRACES_SAMPLERATE,
      SENTRY_TRACE_HEADER: sentryTraceHeader,
      SENTRY_BAGGAGE_HEADER: sentryBaggageHeader,
      VERCEL_PROTECTION_BYPASS_KEY: clusterConfig.VERCEL_PROTECTION_BYPASS_KEY.getSensitiveValue(),
      OPENAI_API_KEY: clusterConfig.OPENAI_API_KEY.getSensitiveValue(),
      ELEVENLABS_API_KEY: clusterConfig.ELEVENLABS_API_KEY.getSensitiveValue(),
    } satisfies Omit<
      Env,
      | 'BOT_TOKEN'
      | 'SENSAY_API_KEY'
      | 'OPENAI_API_KEY'
      | 'ELEVENLABS_API_KEY'
      | 'VERCEL_PROTECTION_BYPASS_KEY'
    > & {
      BOT_TOKEN: string
      SENSAY_API_KEY: string
      OPENAI_API_KEY: string
      ELEVENLABS_API_KEY: string
      VERCEL_PROTECTION_BYPASS_KEY: string
    })

    const botHost = new BotHost(botDefinition, worker, config)
    await botHost.waitForReady()
    return botHost
  }

  on<T extends WorkerEvent>(event: T, listener: (...args: WorkerEventMap[T]) => void) {
    this.worker.on(event, listener)
  }

  async checkHealth(): Promise<boolean> {
    const healCheckResponse = await this.ipcChannel.requestHealthCheck(
      this.config.healthCheckTimeoutMs,
    )
    return healCheckResponse.isHealthy
  }

  async stop() {
    try {
      this.worker.removeAllListeners()
      this.worker.kill(Signal.SIGTERM)

      if (this.worker.isDead()) {
        return
      }

      // Ignore timeout error. It means that the worker didn't exit gracefully
      await this.waitForExit().catch(() => {})
    } finally {
      if (!this.worker.isDead()) {
        this.worker.kill(Signal.SIGKILL)
      }
    }
  }

  private async waitForReady() {
    await this.ipcChannel.waitForReadyEvent(this.config.healthCheckTimeoutMs)
  }

  private async waitForExit() {
    return await withTimeout((resolve) => {
      const listener = (...args: WorkerEventMap[WorkerEvent.EXIT]) => {
        resolve(args)
      }

      this.worker.on(WorkerEvent.EXIT, listener)

      return () => this.worker.off(WorkerEvent.EXIT, listener)
    }, this.config.gracefulShutdownTimeoutMs)
  }
}
