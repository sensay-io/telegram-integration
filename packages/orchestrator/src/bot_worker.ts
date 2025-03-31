import type { BotClient } from '@sensay/bot'
import type { BotDefinition } from './bot_definition'
import { BotIPCChannel, type HealthCheckResponse } from './bot_ipc_channel'
import { traceAll } from './logging/decorators'
import type { Logger } from './logging/logger'
import type { TypedWorker } from './types/worker'
import { chaosTest } from './utils/chaos'

/**
 * BotWorker runs in a child process and is responsible for starting the {@link BotClient}
 * and handling messages from the parent process.
 */
@chaosTest()
@traceAll()
export class BotWorker {
  private readonly ipcChannel: BotIPCChannel

  constructor(
    private readonly botDefinition: BotDefinition,
    private readonly botClient: BotClient,
    private readonly worker: TypedWorker,
    private readonly logger: Logger,
  ) {
    this.logger = logger.child({
      module: `${BotWorker.name}(${this.botDefinition.replicaUUID})`,
      replicaUUID: this.botDefinition.replicaUUID,
      replicaSlug: this.botDefinition.replicaSlug,
    })

    this.ipcChannel = new BotIPCChannel(this.botDefinition, this.worker, this.logger)
    this.ipcChannel.onHealthCheck((request, sendResponse) => {
      const response: HealthCheckResponse = {
        id: request.id,
        type: 'HEALTH_CHECK',
        isHealthy: this.botClient.isHealthy(),
      }

      sendResponse(response)
    })
    this.ipcChannel.sendReadyEvent()
  }

  start() {
    this.botClient.start()
  }

  async stop() {
    await this.botClient.stop()
  }
}
