import { inspect } from 'node:util'
import { type Method, decorateAll } from '@/utils/decorators'
import { config } from '../config/common'
import { Environment } from '../config/environment'
import type { Logger } from './logger'

type TraceAllConfig = {
  env: Environment
}

/**
 * Decorator to trace all methods of a class.
 *
 * @example
 * ```ts
 * ⁣@traceAll()
 * class MyClass {
 *   myMethod() {}
 * }
 * ```
 */
export function traceAll({ env }: TraceAllConfig = { env: Environment.DEVELOPMENT }) {
  if (env !== config.NODE_ENV) {
    return () => {}
  }

  return decorateAll(traceMethod)
}

export function traceMethod<This extends object, Args extends unknown[], Return>(
  method: Method<This, Args, Return>,
  context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>,
) {
  const methodName = String(context.name)

  const getLogger = (target: This) => {
    const withLogger = target as { logger: Logger }
    if (!withLogger.logger) {
      const className = target.constructor.name
      withLogger.logger = config.logger.child({ module: className })
    }

    return withLogger.logger
  }

  function tracedMethod(this: This, ...args: Args): Return {
    const logger = getLogger(this)
    const callString = `${methodName}(${args.map((arg) => inspect(arg)).join(', ')})`
    logger.trace(`${callString} start`)
    try {
      const result = method.call(this, ...args)
      logger.trace(`${callString} end`)
      return result as Return
    } catch (error) {
      logger.error(error as Error, `${callString} error`)
      throw error
    }
  }

  return tracedMethod
}
