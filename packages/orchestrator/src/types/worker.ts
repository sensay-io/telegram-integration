import type { Worker } from 'node:cluster'
import type { Subset } from './common'
import type { Signal } from './process'

export enum WorkerEvent {
  MESSAGE = 'message',
  ERROR = 'error',
  EXIT = 'exit',
}

export type WorkerEventMap = {
  [WorkerEvent.MESSAGE]: [unknown]
  [WorkerEvent.ERROR]: [Error]
  [WorkerEvent.EXIT]: [number, string]
}

export type TypedWorker = Subset<
  Worker,
  {
    process: {
      pid?: number
    }
    on<T extends WorkerEvent>(event: T, listener: (...args: WorkerEventMap[T]) => void): void
    once<T extends WorkerEvent>(event: T, listener: (...args: WorkerEventMap[T]) => void): void
    off<T extends WorkerEvent>(event: T, listener: (...args: WorkerEventMap[T]) => void): void
    send<T>(message: T): void
    isConnected(): boolean
    isDead(): boolean
    removeAllListeners(): void
    kill(signal: Signal): void
  }
>
