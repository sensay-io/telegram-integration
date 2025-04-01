import type { BotDefinition, ReplicaUUID } from './bot_definition'
import { BotStatus, type BotStatusInfo, BotSupervisor } from './bot_supervisor'
import { SensitiveString } from './config/sensitive_string'
import { traceAll } from './logging/decorators'
import type { Logger } from './logging/logger'
import { Integration, type SensayAPI } from './sensay_api'

export type OrchestratorConfig = {
  api: SensayAPI
  logger: Logger
  reloadBotsIntervalMs: number
  printBotsStatusIntervalMs: number
  gracefulShutdownTimeoutMs: number
  healthCheckTimeoutMs: number
  healthCheckIntervalMs: number
  maxFailedRestarts: number
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
          return { replicaUUID, status: BotStatus.UNHEALTHY }
        }
      },
    )
    return Array.from(statuses)
  }

  async start(): Promise<void> {
    await this.reloadBotsDefinitions()

    this.reloadBotsIntervalID = setInterval(
      () => this.reloadBotsDefinitions(),
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
      maxFailedRestarts: this.config.maxFailedRestarts,
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

    const botDefinition = {
      ...existingBotDefinition,
      ...botDefinitionUpdate,
      token,
    }

    const deleteResult = await this.deleteBot(botDefinition.replicaUUID)

    await this.addBot(botDefinition)

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
    try {
      this.botsDefinitions = await this.loadBotsDefinitions()
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
    const replicas = await this.config.api.getReplicas({
      intergration: Integration.TELEGRAM,
    })

    const botsDefinitions: [ReplicaUUID, BotDefinition][] = replicas.map((replica) => {
      return [
        replica.uuid,
        {
          replicaUUID: replica.uuid,
          replicaSlug: replica.slug,
          token: new SensitiveString(replica.telegram_integration?.token ?? ''),
        } satisfies BotDefinition,
      ]
    })
    console.log(new Map(botsDefinitions), 'new Map(botsDefinitions)')
    return new Map(botsDefinitions)
  }
}
