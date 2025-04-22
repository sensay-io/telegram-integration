import { type Logger, SensitiveString, getV1Replicas } from '@sensay/telegram-shared'
import type { BotDefinition, ReplicaSlug, ReplicaUUID } from './bot-definition'
import { BotStatus, type BotStatusInfo, BotSupervisor } from './bot-supervisor'
import { traceAll } from './logging/decorators'

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

type Replica = {
  uuid: string
  slug: string
  ownerID: string
  telegram_integration: {
    token: string | null
    service_name: string | null
  } | null
}

class StateSynchronizationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = StateSynchronizationError.name
    Error.captureStackTrace(this, StateSynchronizationError)
  }
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

  /**
   * Adds a bot to the Orchestrator after loading its definition from the API.
   */
  async addBot(
    replicaUUID: ReplicaUUID,
    replicaSlug: ReplicaSlug,
  ): Promise<BotCRUDOperationResult.Created | BotCRUDOperationResult.NotFound> {
    const botDefinition = await this.loadBotDefinition(replicaSlug)
    if (botDefinition?.replicaUUID !== replicaUUID) {
      throw new StateSynchronizationError(`Replica ${replicaUUID} not found by slug ${replicaSlug}`)
    }

    return this.addBotUnchecked(botDefinition)
  }

  /**
   * Updates a bot in the Orchestrator after loading its definition from the API.
   */
  async updateBot(
    replicaUUID: ReplicaUUID,
    replicaSlug: ReplicaSlug,
  ): Promise<
    | BotCRUDOperationResult.Created
    | BotCRUDOperationResult.Updated
    | BotCRUDOperationResult.NotFound
  > {
    const botDefinition = await this.loadBotDefinition(replicaSlug)
    if (botDefinition?.replicaUUID !== replicaUUID) {
      throw new StateSynchronizationError(`Replica ${replicaUUID} not found by slug ${replicaSlug}`)
    }

    return this.updateBotUnchecked(botDefinition)
  }

  /**
   * Deletes a bot from the Orchestrator after loading its definition from the API.
   */
  async deleteBot(
    replicaUUID: ReplicaUUID,
    replicaSlug: ReplicaSlug,
  ): Promise<BotCRUDOperationResult.Deleted | BotCRUDOperationResult.NotFound> {
    const botDefinition = await this.loadBotDefinition(replicaSlug)
    if (botDefinition?.replicaUUID === replicaUUID) {
      throw new StateSynchronizationError(`Replica ${replicaSlug} still has a Telegram integration`)
    }

    return this.deleteBotUnchecked(replicaUUID)
  }

  /**
   * Adds a bot to the Orchestrator without first checking the API state.
   * Should be called from the checked methods and the Orchestrator API.
   */
  async addBotUnchecked(botDefinition: BotDefinition): Promise<BotCRUDOperationResult.Created> {
    const botSupervisor = new BotSupervisor(botDefinition, {
      healthCheckTimeoutMs: this.config.healthCheckTimeoutMs,
      healthCheckIntervalMs: this.config.healthCheckIntervalMs,
      gracefulShutdownTimeoutMs: this.config.gracefulShutdownTimeoutMs,
      maxFailedStartAttempts: this.config.maxFailedStartAttempts,
      logger: this.config.logger,
    })

    this.botsSupervisors.set(botDefinition.replicaUUID, botSupervisor)
    this.botsDefinitions.set(botDefinition.replicaUUID, botDefinition)

    await botSupervisor.start()

    return BotCRUDOperationResult.Created
  }

  /**
   * Updates a bot in the Orchestrator without first checking the API state.
   * Should be called from the checked methods and the Orchestrator API.
   */
  async updateBotUnchecked(
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

    const deleteResult = await this.deleteBotUnchecked(newBotDefinition.replicaUUID)

    await this.addBotUnchecked(newBotDefinition)

    return deleteResult === BotCRUDOperationResult.Deleted
      ? BotCRUDOperationResult.Updated
      : BotCRUDOperationResult.Created
  }

  /**
   * Deletes a bot from the Orchestrator without first checking the API state.
   * Should be called from the checked methods and the Orchestrator API.
   */
  async deleteBotUnchecked(
    replicaUUID: ReplicaUUID,
  ): Promise<BotCRUDOperationResult.Deleted | BotCRUDOperationResult.NotFound> {
    const botSupervisor = this.botsSupervisors.get(replicaUUID)
    if (botSupervisor) {
      await botSupervisor.stop()
      this.botsSupervisors.delete(replicaUUID)
      this.botsDefinitions.delete(replicaUUID)
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
          await this.updateBot(botDefinition.replicaUUID, botDefinition.replicaSlug)
        } else {
          await this.addBot(botDefinition.replicaUUID, botDefinition.replicaSlug)
        }
      } catch (error) {
        this.logger.error(error as Error, `Failed to reload bot ${botDefinition.replicaSlug}`)
      }
    }

    const runningBotsDefinitions = this.botsSupervisors
      .values()
      .map((botSupervisor) => botSupervisor.botDefinition)
    for (const botDefinition of runningBotsDefinitions) {
      if (this.botsDefinitions.has(botDefinition.replicaUUID)) {
        continue
      }

      try {
        await this.deleteBot(botDefinition.replicaUUID, botDefinition.replicaSlug)
      } catch (error) {
        this.logger.error(error as Error, `Failed to delete bot ${botDefinition.replicaSlug}`)
      }
    }
  }

  private async loadBotsDefinitions(): Promise<Map<ReplicaUUID, BotDefinition>> {
    const botsDefinitions = new Map<ReplicaUUID, BotDefinition>()

    for await (const replica of this.loadAllReplicas()) {
      if (replica.telegram_integration?.service_name !== this.config.telegramServiceName) {
        continue
      }

      const botDefinition = {
        replicaUUID: replica.uuid,
        replicaSlug: replica.slug,
        ownerID: replica.ownerID,
        token: new SensitiveString(replica.telegram_integration.token ?? ''),
      } satisfies BotDefinition
      botsDefinitions.set(botDefinition.replicaUUID, botDefinition)
    }

    return botsDefinitions
  }

  private async loadBotDefinition(replicaSlug: ReplicaSlug): Promise<BotDefinition | null> {
    const replicas = await this.loadReplicasPage(1, 1, replicaSlug)
    if (replicas.items.length === 0) {
      return null
    }

    const replica = replicas.items[0]
    if (replica.telegram_integration?.service_name !== this.config.telegramServiceName) {
      return null
    }

    const botDefinition = {
      replicaUUID: replica.uuid,
      replicaSlug: replica.slug,
      ownerID: replica.ownerID,
      token: new SensitiveString(replica.telegram_integration.token ?? ''),
    } satisfies BotDefinition
    return botDefinition
  }

  private async *loadAllReplicas(): AsyncIterable<Replica> {
    let totalPages = 0
    let pageIndex = 1 // page_index in the API starts with 1
    const pageSize = 100
    do {
      const { total, items } = await this.loadReplicasPage(pageIndex, pageSize)
      totalPages = Math.ceil(total / pageSize)
      this.logger.trace(`Processing replicas page ${pageIndex} of ${totalPages}`)
      pageIndex++
      yield* items
    } while (pageIndex <= totalPages)
  }

  private async loadReplicasPage(
    pageIndex: number,
    pageSize: number,
    replicaSlug?: ReplicaSlug,
  ): Promise<{
    total: number
    items: Replica[]
  }> {
    const replicas = await getV1Replicas({
      query: {
        integration: 'telegram',
        page_index: pageIndex,
        page_size: pageSize,
        slug: replicaSlug,
      },
    })

    const { total, items } = replicas.data
    return { total, items }
  }
}
