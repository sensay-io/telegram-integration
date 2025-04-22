import process from 'node:process'
import type { Breadcrumb as SentryBreadcrumb } from '@sentry/core'
import * as Sentry from '@sentry/node'
import pino, { type Logger as PinoLogger } from 'pino'
import pretty from 'pino-pretty'

export enum LoggerLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

export type Breadcrumb = SentryBreadcrumb

export type LoggerConfig = {
  level?: LoggerLevel
  scope?: Sentry.Scope
}

export class Logger {
  private constructor(
    private readonly pinoLogger: PinoLogger,
    private readonly scope: Sentry.Scope,
  ) {}

  static create({
    level = LoggerLevel.INFO,
    scope = Sentry.getCurrentScope(),
  }: LoggerConfig): Logger {
    const pinoLogger = pino(
      {
        level,
        redact: ['token'],
      },
      pretty({
        messageFormat: (log, messageKey) => {
          const message = log[messageKey]
          const module = log.module
          return module ? `[${module}] ${message}` : String(message)
        },
        translateTime: true,
        singleLine: true,
      }),
    )

    return new Logger(pinoLogger, scope)
  }

  trace(obj: object | string, msg?: string, ...args: unknown[]): void {
    this.pinoLogger.trace(obj, msg, ...args)
  }

  debug(obj: object | string, msg?: string, ...args: unknown[]): void {
    this.pinoLogger.debug(obj, msg, ...args)
  }

  table(data: unknown[] | Record<string, unknown>, columns?: string[]): void {
    console.table(data, columns)
  }

  info(obj: object | string, msg?: string, ...args: unknown[]): void {
    this.pinoLogger.info(obj, msg, ...args)
  }

  warn(obj: object | string, msg?: string, ...args: unknown[]): string {
    this.pinoLogger.warn(obj, msg, ...args)
    return this.scope.captureMessage(`${obj}`, 'warning', { data: { args } })
  }

  error(error: Error | string, msg?: string, ...args: unknown[]): string {
    this.pinoLogger.error(error, msg, ...args)
    return this.scope.captureException(error, { data: { args } })
  }

  async fatal(error: Error | string, msg?: string, ...args: unknown[]): Promise<string> {
    this.pinoLogger.fatal(error, msg, ...args)
    const eventId = this.scope.captureException(error, { data: { args } })
    // The fatal method is commonly called before exiting the process.
    // Sentry events need to be flushed first, otherwise they will be lost.
    await Sentry.flush()
    return eventId
  }

  child(bindings: Record<string, unknown> & { module: string }): Logger {
    const scope = this.scope.clone()
    scope.setContext('logger', {
      ...bindings,
    })
    return new Logger(this.pinoLogger.child(bindings), scope)
  }

  addErrorBreadcrumb(error: Error) {
    const breadcrumb: Breadcrumb = {
      type: 'error',
      message: error.message,
      data: { error },
    }
    this.addBreadcrumb(breadcrumb)
  }

  addBreadcrumb(breadcrumb: Breadcrumb) {
    this.scope.addBreadcrumb(breadcrumb)
    this.trace(breadcrumb, breadcrumb.message)
  }

  printMemoryUsage() {
    const memoryUsage = Object.entries(process.memoryUsage()).map(([key, value]) => {
      return {
        'Memory usage': key,
        MB: `${(value / 1000000).toFixed(2)} MB`,
      }
    })
    this.table(memoryUsage, ['Memory usage', 'MB'])
  }
}
