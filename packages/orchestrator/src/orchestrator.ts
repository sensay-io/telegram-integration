import { getV1Replicas } from '@sensay/telegram-shared'
import type { BotDefinition, ReplicaUUID } from './bot_definition'
import { BotStatus, type BotStatusInfo, BotSupervisor } from './bot_supervisor'
import { SensitiveString } from './config/sensitive_string'
import { traceAll } from './logging/decorators'
import type { Logger } from './logging/logger'

export type OrchestratorConfig = {
  logger: Logger
  telegramServiceName: string
  reloadBotsIntervalMs: number
  printBotsStatusIntervalMs: number
  gracefulShutdownTimeoutMs: number
  healthCheckTimeoutMs: number
  healthCheckIntervalMs: number
  maxFailedStartAttempts: number
}

export enum BotCRUDOperationResult {
  Created = 'created',
  Updated = 'updated',
  Deleted = 'deleted',
  NotFound = 'not_found',
}

/**
 * The Orchestrator acts as a central coordinator for all bot instances.
 * The goal of the Orchestrator is to ensure that exactly one instance of each bot is running and healthy.
 * It's responsible for:
 * - Loading the bots definitions from the Sensay API
 * - Starting a child process for each bot
 * - Monitoring the health of the bots
 * - Restarting failed and unhealthy bots
 * - Adding, updating and removing bots by external requests
 * - Shutting down the bots when the process is terminated
 */
@traceAll()
export class Orchestrator {
  private botsDefinitions: Map<ReplicaUUID, BotDefinition> = new Map()
  private readonly botsSupervisors: Map<ReplicaUUID, BotSupervisor> = new Map()
  private reloadBotsIntervalID: NodeJS.Timeout | undefined

  constructor(private readonly config: OrchestratorConfig) {
    this.logger = config.logger.child({
      module: Orchestrator.name,
    })
  }

  private readonly logger: Logger

  isHealthy(): boolean {
    return (
      this.botsSupervisors.size === this.botsDefinitions.size &&
      this.getStatus().every((status) => status.status === 'running')
    )
  }

  getStatus(): BotStatusInfo[] {
    const statuses = Array.from(this.botsSupervisors.entries()).map(
      ([replicaUUID, botSupervisor]) => {
        try {
          return botSupervisor.getStatusInfo()
        } catch (error) {
          const botDefinition = this.botsDefinitions.get(replicaUUID)
          return { ...botDefinition, status: BotStatus.UNHEALTHY } as BotStatusInfo
        }
      },
    )
    return Array.from(statuses)
  }

  async start(): Promise<void> {
    await this.reloadBotsDefinitions()

    this.reloadBotsIntervalID = setInterval(
      async () => await this.reloadBotsDefinitions(),
      this.config.reloadBotsIntervalMs,
    )
  }

  async shutdown(): Promise<void> {
    clearInterval(this.reloadBotsIntervalID ?? undefined)

    await Promise.allSettled(this.botsSupervisors.values().map((supervisor) => supervisor.stop()))
  }

  async addBot(botDefinition: BotDefinition): Promise<BotCRUDOperationResult.Created> {
    const botSupervisor = new BotSupervisor(botDefinition, {
      healthCheckTimeoutMs: this.config.healthCheckTimeoutMs,
      healthCheckIntervalMs: this.config.healthCheckIntervalMs,
      gracefulShutdownTimeoutMs: this.config.gracefulShutdownTimeoutMs,
      maxFailedStartAttempts: this.config.maxFailedStartAttempts,
      logger: this.config.logger,
    })

    this.botsSupervisors.set(botDefinition.replicaUUID, botSupervisor)

    await botSupervisor.start()

    return BotCRUDOperationResult.Created
  }

  async updateBot(
    botDefinitionUpdate: Pick<BotDefinition, 'replicaUUID'> & Partial<BotDefinition>,
  ): Promise<
    | BotCRUDOperationResult.Created
    | BotCRUDOperationResult.Updated
    | BotCRUDOperationResult.NotFound
  > {
    const existingBotDefinition = this.botsDefinitions.get(botDefinitionUpdate.replicaUUID)

    const token = botDefinitionUpdate.token ?? existingBotDefinition?.token
    if (!token) {
      return BotCRUDOperationResult.NotFound
    }

    const newBotDefinition = Object.assign({}, existingBotDefinition, botDefinitionUpdate, {
      token,
    })

    // TODO: Implement general equality function
    if (
      newBotDefinition.replicaUUID === existingBotDefinition?.replicaUUID &&
      newBotDefinition.replicaSlug === existingBotDefinition?.replicaSlug &&
      newBotDefinition.ownerID === existingBotDefinition?.ownerID &&
      newBotDefinition.token.getSensitiveValue() ===
        existingBotDefinition?.token.getSensitiveValue()
    ) {
      return BotCRUDOperationResult.Updated
    }

    const deleteResult = await this.deleteBot(newBotDefinition.replicaUUID)

    await this.addBot(newBotDefinition)

    return deleteResult === BotCRUDOperationResult.Deleted
      ? BotCRUDOperationResult.Updated
      : BotCRUDOperationResult.Created
  }

  async deleteBot(
    replicaUUID: ReplicaUUID,
  ): Promise<BotCRUDOperationResult.Deleted | BotCRUDOperationResult.NotFound> {
    const botSupervisor = this.botsSupervisors.get(replicaUUID)
    if (botSupervisor) {
      await botSupervisor.stop()
      this.botsSupervisors.delete(replicaUUID)
      return BotCRUDOperationResult.Deleted
    }

    return BotCRUDOperationResult.NotFound
  }

  private async reloadBotsDefinitions(): Promise<void> {
    this.logger.addBreadcrumb({
      category: 'reload_bots_definitions',
      message: 'Reloading bots definitions',
    })

    try {
      this.botsDefinitions = await this.loadBotsDefinitions()
      console.table(Array.from(this.botsDefinitions.values()))
    } catch (error) {
      this.logger.error(error as Error, 'Failed to reload bots definitions')
      return
    }

    for (const botDefinition of this.botsDefinitions.values()) {
      try {
        if (this.botsSupervisors.has(botDefinition.replicaUUID)) {
          await this.updateBot(botDefinition)
        } else {
          await this.addBot(botDefinition)
        }
      } catch (error) {
        this.logger.error(error as Error, `Failed to reload bot ${botDefinition.replicaSlug}`)
      }
    }

    for (const replicaUUID of this.botsSupervisors.keys()) {
      if (this.botsDefinitions.has(replicaUUID)) {
        continue
      }

      try {
        await this.deleteBot(replicaUUID)
      } catch (error) {
        this.logger.error(error as Error, `Failed to delete bot ${replicaUUID}`)
      }
    }
  }

  private async loadBotsDefinitions(): Promise<Map<ReplicaUUID, BotDefinition>> {
    const replicas = await getV1Replicas({
      query: {
        integration: 'telegram',
      },
    })

    const botsDefinitions: [ReplicaUUID, BotDefinition][] = replicas.data.items
      .filter(
        (replica) => replica.telegram_integration?.service_name === this.config.telegramServiceName,
      )
      .map((replica) => {
        return [
          replica.uuid,
          {
            replicaUUID: replica.uuid,
            replicaSlug: replica.slug,
            ownerID: replica.ownerID,
            token: new SensitiveString(replica.telegram_integration?.token ?? ''),
          } satisfies BotDefinition,
        ]
      })
    return new Map(botsDefinitions)
  }
}
