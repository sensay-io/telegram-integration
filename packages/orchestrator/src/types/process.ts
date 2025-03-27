import process from 'node:process'
import type { Subset } from './common'

export enum Signal {
  SIGINT = 'SIGINT',
  SIGTERM = 'SIGTERM',
  SIGQUIT = 'SIGQUIT',
  SIGKILL = 'SIGKILL',
  SIGUSR1 = 'SIGUSR1',
  SIGUSR2 = 'SIGUSR2',
}

export enum Event {
  UNCAUGHT_EXCEPTION = 'uncaughtException',
  UNHANDLED_REJECTION = 'unhandledRejection',
}

type SignalListener = (signal: Signal) => void

type TypedProcess = Subset<
  typeof process,
  {
    pid: number
    env: typeof process.env
    exit: (code: number) => never
    on(event: Event.UNCAUGHT_EXCEPTION, listener: (error: Error) => void): void
    on(event: Event.UNHANDLED_REJECTION, listener: (error: Error) => void): void
    on(event: Signal, listener: SignalListener): void
  }
>

const typedProcess: TypedProcess = process
export { typedProcess as process }
