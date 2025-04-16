import type { BotDefinition } from './bot_definition'
import { BotHost } from './bot_host'
import { traceAll } from './logging/decorators'
import type { Logger } from './logging/logger'
import { WorkerEvent } from './types/worker'
import { chaosTest } from './utils/chaos'

type BotSupervisorConfig = {
  healthCheckTimeoutMs: number
  healthCheckIntervalMs: number
  gracefulShutdownTimeoutMs: number
  maxFailedStartAttempts: number
  logger: Logger
}

export enum BotStatus {
  RUNNING = 'running',
  UNHEALTHY = 'unhealthy',
  STOPPED = 'stopped',
  RESTARTING = 'restarting',
  FAILED = 'failed',
}

export type BotStatusInfo = {
  replicaUUID: string
  replicaSlug?: string
  ownerUUID: string
  status: BotStatus
  pid?: number
}

/**
 * BotSupervisor is responsible for a single bot instance.
 * It will start the bot, monitor its health, restart unhealthy bots, and handle graceful shutdowns.
 * It communicates with the {@link BotWorker} through the {@link BotHost}.
 */
@chaosTest()
@traceAll()
export class BotSupervisor {
  private readonly logger: Logger
  private botHost: BotHost | null = null
  private healthCheckIntervalID: NodeJS.Timeout | null = null
  private restartTimeoutID: NodeJS.Timeout | null = null
  private failedStartAttempts = 0
  private isHealthy = false

  constructor(
    private readonly botDefinition: BotDefinition,
    private readonly config: BotSupervisorConfig,
  ) {
    this.logger = config.logger.child({
      module: BotSupervisor.name,
      replicaUUID: this.botDefinition.replicaUUID,
      replicaSlug: this.botDefinition.replicaSlug,
    })
  }

  get status(): BotStatus {
    if (this.failedStartAttempts >= this.config.maxFailedStartAttempts) {
      return BotStatus.FAILED
    }

    if (!this.botHost || !this.botHost.isConnected) {
      return BotStatus.STOPPED
    }

    if (!this.isHealthy) {
      return BotStatus.UNHEALTHY
    }

    if (this.failedStartAttempts > 0) {
      return BotStatus.RESTARTING
    }

    return BotStatus.RUNNING
  }

  getStatusInfo(): BotStatusInfo {
    return {
      replicaUUID: this.botDefinition.replicaUUID,
      replicaSlug: this.botDefinition.replicaSlug,
      ownerUUID: this.botDefinition.ownerUUID,
      status: this.status,
      pid: this.botHost?.PID,
    }
  }

  async start(): Promise<void> {
    this.logger.addBreadcrumb({ message: this.start.name })

    try {
      this.botHost = await BotHost.start(this.botDefinition, this.config)

      this.botHost.on(WorkerEvent.EXIT, (code, signal) => {
        this.logger.addBreadcrumb({ message: 'Worker exit', data: { code, signal } })
        this.stop()
        this.scheduleRestart()
      })

      this.botHost.on(WorkerEvent.ERROR, (err) => {
        this.logger.addErrorBreadcrumb(err)
        this.stop()
        this.scheduleRestart()
      })

      this.startHealthChecks()

      this.isHealthy = await this.botHost.checkHealth()
    } catch (err) {
      this.logger.error(err as Error, `Failed to start bot ${this.botDefinition.replicaSlug}`)
      this.isHealthy = false
    }

    if (this.isHealthy) {
      this.failedStartAttempts = 0
      return
    }

    this.failedStartAttempts++

    if (this.failedStartAttempts < this.config.maxFailedStartAttempts) {
      this.logger.addBreadcrumb({ message: 'Bot is unhealthy, scheduling restart', data: { attempts: this.failedStartAttempts } })
      this.scheduleRestart()
      return
    }

    this.logger.error(
      `Failed to start bot ${this.botDefinition.replicaSlug} after ${this.failedStartAttempts} attempts`,
    )

    await this.stop()
  }

  async stop(): Promise<void> {
    this.logger.addBreadcrumb({ message: this.stop.name })

    try {
      this.stopHealthChecks()
      await this.botHost?.stop()
      this.botHost = null
    } catch (err) {
      this.logger.addErrorBreadcrumb(err as Error)
    }
  }

  private async restart(): Promise<void> {
    this.logger.addBreadcrumb({ message: this.restart.name })

    clearTimeout(this.restartTimeoutID ?? undefined)

    await this.stop()
    await this.start()
  }

  private scheduleRestart() {
    clearTimeout(this.restartTimeoutID ?? undefined)
    this.stopHealthChecks()

    if (this.failedStartAttempts >= this.config.maxFailedStartAttempts) {
      return
    }

    this.restartTimeoutID = setTimeout(() => this.restart(), this.config.healthCheckIntervalMs)
  }

  private startHealthChecks() {
    this.stopHealthChecks()

    this.healthCheckIntervalID = setInterval(
      () => this.checkHealth(),
      this.config.healthCheckIntervalMs,
    )
  }

  private stopHealthChecks() {
    clearInterval(this.healthCheckIntervalID ?? undefined)
  }

  private async checkHealth(): Promise<void> {
    this.logger.addBreadcrumb({ message: this.checkHealth.name })

    try {
      if (!this.botHost) {
        return
      }

      this.isHealthy = false
      this.isHealthy = await this.botHost.checkHealth()
    } catch (err) {
      this.logger.addErrorBreadcrumb(err as Error)

      this.scheduleRestart()
    }
  }
}
