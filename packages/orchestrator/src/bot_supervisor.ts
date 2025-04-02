import type { BotDefinition } from './bot_definition'
import { BotHost } from './bot_host'
import { traceAll } from './logging/decorators'
import type { Logger } from './logging/logger'
import { chaosTest } from './utils/chaos'

type BotSupervisorConfig = {
  healthCheckTimeoutMs: number
  healthCheckIntervalMs: number
  gracefulShutdownTimeoutMs: number
  maxFailedRestarts: number
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
  status: BotStatus
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
  private failedRestarts = 0
  private isHealthy = false

  constructor(
    private readonly botDefinition: BotDefinition,
    private readonly config: BotSupervisorConfig,
  ) {
    this.logger = config.logger.child({
      module: `${BotSupervisor.name}(${this.botDefinition.replicaUUID})`,
      replicaUUID: this.botDefinition.replicaUUID,
      replicaSlug: this.botDefinition.replicaSlug,
    })
  }

  get status(): BotStatus {
    if (!this.botHost || !this.botHost.isConnected) {
      return BotStatus.STOPPED
    }

    if (!this.isHealthy) {
      return BotStatus.UNHEALTHY
    }

    if (this.failedRestarts >= this.config.maxFailedRestarts) {
      return BotStatus.FAILED
    }

    if (this.failedRestarts > 0) {
      return BotStatus.RESTARTING
    }

    return BotStatus.RUNNING
  }

  getStatusInfo(): BotStatusInfo {
    return {
      replicaUUID: this.botDefinition.replicaUUID,
      replicaSlug: this.botDefinition.replicaSlug,
      status: this.status,
    }
  }

  async start(): Promise<void> {
    try {
      this.botHost = await BotHost.start(this.botDefinition, this.config)
      this.isHealthy = await this.botHost.checkHealth()
      this.startHealthChecks()
    } catch (err) {
      this.isHealthy = false
      this.logger.error(err as Error, `Error starting bot ${this.botDefinition.replicaSlug}`)
    }
  }

  async stop(): Promise<void> {
    try {
      this.stopHealthChecks()
      await this.botHost?.stop()
      this.botHost = null
    } catch (err) {
      this.logger.error(err as Error, `Error stopping bot ${this.botDefinition.replicaSlug}`)
    }
  }

  private async restart(): Promise<void> {
    try {
      clearTimeout(this.restartTimeoutID ?? undefined)

      await this.stop()

      this.botHost = await BotHost.start(this.botDefinition, this.config)

      this.isHealthy = await this.botHost.checkHealth()
      if (this.isHealthy) {
        this.failedRestarts = 0
        this.startHealthChecks()
        return
      }

      this.failedRestarts++

      if (this.failedRestarts <= this.config.maxFailedRestarts) {
        this.scheduleRestart()
      } else {
        await this.stop()
      }
    } catch (err) {
      this.logger.error(err as Error, `Error restarting bot ${this.botDefinition.replicaSlug}`)
    }
  }

  private scheduleRestart() {
    if (this.failedRestarts > this.config.maxFailedRestarts) {
      return
    }

    clearTimeout(this.restartTimeoutID ?? undefined)

    this.restartTimeoutID = setTimeout(() => {
      try {
        this.restart()
      } catch (err) {
        this.logger.error(err as Error, `Error restarting bot ${this.botDefinition.replicaSlug}`)
        this.failedRestarts++
        this.scheduleRestart()
      }
    }, this.config.healthCheckIntervalMs)
  }

  private startHealthChecks() {
    this.healthCheckIntervalID = setInterval(() => {
      try {
        this.checkHealth()
      } catch (err) {
        this.logger.error(
          err as Error,
          `Error checking health for bot ${this.botDefinition.replicaSlug}`,
        )
      }
    }, this.config.healthCheckIntervalMs)
  }

  private stopHealthChecks() {
    clearInterval(this.healthCheckIntervalID ?? undefined)
  }

  private async checkHealth(): Promise<void> {
    if (!this.botHost) {
      return
    }

    try {
      this.isHealthy = false
      this.isHealthy = await this.botHost.checkHealth()
    } catch (err) {
      this.logger.error(
        err as Error,
        `Error checking health for bot ${this.botDefinition.replicaSlug}`,
      )
    } finally {
      if (!this.isHealthy) {
        this.restart()
      }
    }
  }
}
