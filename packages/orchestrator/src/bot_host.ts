import cluster from 'node:cluster'
import type { BotDefinition } from './bot_definition'
import { BotIPCChannel } from './bot_ipc_channel'
import type { Env } from './config/worker'
import { traceAll } from './logging/decorators'
import type { Logger, LoggerLevel } from './logging/logger'
import { Signal, process } from './types/process'
import { type TypedWorker, WorkerEvent, type WorkerEventMap } from './types/worker'
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
@traceAll()
export class BotHost {
  constructor(
    private readonly botDefinition: BotDefinition,
    private readonly worker: TypedWorker,
    private readonly ipcChannel: BotIPCChannel,
    private readonly config: BotHostConfig,
    private readonly logger: Logger,
  ) {
    this.logger = logger.child({
      module: `${BotHost.name}(${this.botDefinition.replicaUUID})`,
      replicaUUID: this.botDefinition.replicaUUID,
      replicaSlug: this.botDefinition.replicaSlug,
    })
  }

  get isConnected(): boolean {
    return this.worker?.isConnected()
  }

  static async start(botDefinition: BotDefinition, config: BotHostConfig) {
    const logger = config.logger.child({
      module: BotHost.name,
      replicaUUID: botDefinition.replicaUUID,
      replicaSlug: botDefinition.replicaSlug,
    })

    const worker = cluster.fork({
      // Every environment variable is passed as a raw string
      BOT_TOKEN: botDefinition.token.getSensitiveValue(),
      REPLICA_UUID: botDefinition.replicaUUID,
      REPLICA_SLUG: botDefinition.replicaSlug,
      NODE_ENV: process.env.NODE_ENV,
      LOG_LEVEL: process.env.LOG_LEVEL as LoggerLevel,
    } satisfies Omit<Env, 'BOT_TOKEN'> & { BOT_TOKEN: string })
    console.log(worker, 'worker')

    const ipcChannel = new BotIPCChannel(botDefinition, worker, logger)
    await ipcChannel.waitForReadyEvent(config.healthCheckTimeoutMs)
    return new BotHost(botDefinition, worker, ipcChannel, config, logger)
  }

  async checkHealth(): Promise<boolean> {
    const healCheckResponse = await this.ipcChannel.requestHealthCheck(
      this.config.healthCheckTimeoutMs,
    )
    return healCheckResponse.isHealthy
  }

  async stop() {
    this.worker.removeAllListeners()
    this.worker.kill(Signal.SIGTERM)

    await this.waitForExit()

    if (!this.worker.isDead()) {
      this.worker.kill(Signal.SIGKILL)
    }
  }

  private async waitForExit() {
    return await withTimeout((resolve) => {
      const listener = (message: WorkerEventMap[WorkerEvent.EXIT]) => {
        resolve(message)
      }

      this.worker.on(WorkerEvent.EXIT, listener)

      return () => this.worker.off(WorkerEvent.EXIT, listener)
    }, this.config.gracefulShutdownTimeoutMs)
  }
}
