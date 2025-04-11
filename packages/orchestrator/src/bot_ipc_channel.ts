import { randomUUID } from 'node:crypto'
import type { BotDefinition } from './bot_definition'
import type { Logger } from './logging/logger'
import { type TypedWorker, WorkerEvent } from './types/worker'
import { chaosTest } from './utils/chaos'
import { withTimeout } from './utils/timer'

export type HealthCheckRequest = {
  id: string
  type: 'HEALTH_CHECK'
}

export type HealthCheckResponse = {
  id: string
  type: 'HEALTH_CHECK'
  isHealthy: boolean
}

export type ReadyMessage = {
  id?: string
  type: 'READY'
}

type BotRequest = HealthCheckRequest | ReadyMessage
type BotResponse = HealthCheckResponse | ReadyMessage
type BotResponseFor<T extends BotRequest> = Extract<BotResponse, { type: T['type'] }>
type BotRequestHandler<T extends BotRequest> = (
  params: T,
  sendResponse: (response: BotResponseFor<T>) => void,
) => void

/**
 * BotIPCChannel is used for communication between the {@link BotHost} process and the {@link BotWorker} process.
 * It tries to hide the low-level details of the IPC mechanism, and provide a type-safe API on top of it.
 */
@chaosTest()
export class BotIPCChannel {
  constructor(
    private readonly botDefinition: BotDefinition,
    private readonly worker: TypedWorker,
    private readonly logger: Logger,
  ) {
    this.logger = logger.child({
      module: `${BotIPCChannel.name}(${this.botDefinition.replicaUUID})`,
      replicaUUID: this.botDefinition.replicaUUID,
      replicaSlug: this.botDefinition.replicaSlug,
    })
  }

  requestHealthCheck(timeoutMs: number): Promise<HealthCheckResponse> {
    return this.sendRequest<HealthCheckRequest>(
      { id: randomUUID(), type: 'HEALTH_CHECK' },
      timeoutMs,
    )
  }

  onHealthCheck(handler: BotRequestHandler<HealthCheckRequest>) {
    this.onRequest('HEALTH_CHECK', handler)
  }

  sendReadyEvent() {
    this.worker.send({ type: 'READY' })
  }

  // Workaround for https://github.com/nodejs/node/issues/48578
  async waitForReadyEvent(timeoutMs: number): Promise<ReadyMessage> {
    return await this.waitForMessage({ type: 'READY' }, timeoutMs)
  }

  private waitForMessage<TRequest extends BotRequest>(
    request: TRequest,
    timeoutMs: number,
  ): Promise<BotResponseFor<TRequest>> {
    return withTimeout((resolve) => {
      const handler = (message: unknown) => {
        const response = message as BotResponseFor<TRequest>
        if (response.type === request.type && response.id === request.id) {
          resolve(response)
        }
      }

      // Don't use `Worker.once` here since there is no guarantee that
      // the first event will the one that is awaited
      this.worker.on(WorkerEvent.MESSAGE, handler)

      return () => this.worker.off(WorkerEvent.MESSAGE, handler)
    }, timeoutMs)
  }

  private sendRequest<T extends BotRequest>(
    request: T,
    timeoutMs: number,
  ): Promise<BotResponseFor<T>> {
    this.worker.send(request)
    return this.waitForMessage(request, timeoutMs)
  }

  private onRequest<T extends BotRequest>(requestType: T['type'], handler: BotRequestHandler<T>) {
    this.worker.on(WorkerEvent.MESSAGE, (message) => {
      const request = message as T
      if (request.type === requestType) {
        handler(request, (response) => this.worker.send(response))
      }
    })
  }
}
