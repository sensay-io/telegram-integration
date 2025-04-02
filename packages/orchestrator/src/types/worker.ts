import type { Worker } from 'node:cluster'
import type { Subset } from './common'
import type { Signal } from './process'

export enum WorkerEvent {
  MESSAGE = 'message',
  EXIT = 'exit',
}

export type WorkerEventMap = {
  [WorkerEvent.MESSAGE]: [unknown]
  [WorkerEvent.EXIT]: [number, string]
}

export type TypedWorker = Subset<
  Worker,
  {
    on<T>(event: WorkerEvent, listener: (message: T) => void): void
    once<T>(event: WorkerEvent, listener: (message: T) => void): void
    off<T>(event: WorkerEvent, listener: (message: T) => void): void
    send<T>(message: T): void
    isConnected(): boolean
    isDead(): boolean
    removeAllListeners(): void
    kill(signal: Signal): void
  }
>
