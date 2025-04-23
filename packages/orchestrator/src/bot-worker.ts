import type { BotClient } from '@sensay/telegram-bot'
import type { Logger, TypedWorker } from '@sensay/telegram-shared'
import type { BotDefinition } from './bot-definition'
import { BotIPCChannel, type HealthCheckResponse } from './bot-ipc-channel'
import { traceAll } from './logging/decorators'
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
      module: BotWorker.name,
      replicaUUID: this.botDefinition.replicaUUID,
      replicaSlug: this.botDefinition.replicaSlug,
    })

    this.ipcChannel = new BotIPCChannel(this.botDefinition, this.worker, this.logger)
    this.ipcChannel.onHealthCheck(async (request, sendResponse) => {
      const response: HealthCheckResponse = {
        id: request.id,
        type: 'HEALTH_CHECK',
        isHealthy: await this.botClient.isHealthy(),
      }

      sendResponse(response)
    })
    this.ipcChannel.sendReadyEvent()
  }

  async start() {
    await this.botClient.start()
  }

  async stop() {
    await this.botClient.stop()
  }
}
