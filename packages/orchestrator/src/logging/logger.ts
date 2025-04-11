import type { Breadcrumb as SentryBreadcrumb } from '@sentry/core'
import type * as Sentry from '@sentry/node'
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
  scope: Sentry.Scope
}

export class Logger {
  private constructor(
    private readonly pinoLogger: PinoLogger,
    private readonly scope: Sentry.Scope,
  ) {}

  static create({ level = LoggerLevel.INFO, scope }: LoggerConfig): Logger {
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

  table(data: unknown[] | Record<string, unknown>) {
    console.table(data)
  }

  info(obj: object | string, msg?: string, ...args: unknown[]): void {
    this.pinoLogger.info(obj, msg, ...args)
  }

  warn(obj: object | string, msg?: string, ...args: unknown[]): void {
    this.scope.captureMessage(`${obj}`, 'warning')
    this.pinoLogger.warn(obj, msg, ...args)
  }

  error(error: Error | string, msg?: string, ...args: unknown[]): void {
    this.scope.captureException(error)
    this.pinoLogger.error(error, msg, ...args)
  }

  fatal(error: Error | string, msg?: string, ...args: unknown[]): void {
    this.scope.captureException(error)
    this.pinoLogger.fatal(error, msg, ...args)
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
}
