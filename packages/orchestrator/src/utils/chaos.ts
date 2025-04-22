import { inspect } from 'node:util'
import { config } from '@sensay/telegram-shared'
import { Environment, type Logger } from '@sensay/telegram-shared'
import { type Method, decorateAll } from './decorators'

type ChaosConfig = {
  env: Environment
}

/**
 * Decorator to randomly throw errors in methods.
 *
 * @example
 * ```ts
 * ⁣@chaosTest()
 * class MyClass {
 *   myMethod() {}
 * }
 * ```
 */
export function chaosTest({ env }: ChaosConfig = { env: Environment.CHAOS }) {
  if (env !== config.NODE_ENV) {
    return () => {}
  }

  return decorateAll(chaosTestMethod)
}

export function chaosTestMethod<This extends object, Args extends unknown[], Return>(
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

  function chaosMethod(this: This, ...args: Args): Return {
    const shouldThrow = Math.random() < 0.01
    if (shouldThrow) {
      const logger = getLogger(this)
      const error = new Error(
        `${methodName}(${args.map((arg) => inspect(arg)).join(', ')}) chaos error`,
      )
      logger.error(error)
      throw error
    }

    return method.call(this, ...args) as Return
  }

  return chaosMethod
}
