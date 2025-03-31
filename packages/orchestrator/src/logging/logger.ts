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

export type LoggerConfig = {
  level?: LoggerLevel
}

export class Logger {
  private constructor(private readonly pinoLogger: PinoLogger) {}

  static create({ level = LoggerLevel.INFO }: LoggerConfig): Logger {
    const pinoLogger = pino(
      {
        level,
        redact: ['token'],
      },
      pretty({
        messageFormat: (log, messageKey) => {
          const message = log[messageKey]
          const module = log.module
          const bot = log.bot
          if (module) {
            if (bot) {
              return `[${module}] [${bot}] ${message}`
            }

            return `[${module}] ${message}`
          }

          return String(message)
        },
        translateTime: true,
        singleLine: true,
      }),
    )

    return new Logger(pinoLogger)
  }

  trace(obj: object | string, msg?: string, ...args: unknown[]): void {
    this.pinoLogger.trace(obj, msg, ...args)
  }

  debug(obj: object | string, msg?: string, ...args: unknown[]): void {
    this.pinoLogger.debug(obj, msg, ...args)
  }

  info(obj: object | string, msg?: string, ...args: unknown[]): void {
    this.pinoLogger.info(obj, msg, ...args)
  }

  warn(obj: object | string, msg?: string, ...args: unknown[]): void {
    this.pinoLogger.warn(obj, msg, ...args)
  }

  error(error: Error | string, msg?: string, ...args: unknown[]): void {
    this.pinoLogger.error(error, msg, ...args)
  }

  fatal(error: Error | string, msg?: string, ...args: unknown[]): void {
    this.pinoLogger.fatal(error, msg, ...args)
  }

  child(bindings: Record<string, unknown>): Logger {
    return new Logger(this.pinoLogger.child(bindings))
  }
}
