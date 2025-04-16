// biome-ignore lint/suspicious/noExplicitAny: <explanation>
type Constructor<T = object> = new (...args: any[]) => T

export type Method<This extends object, Args extends unknown[], Return> = (
  this: This,
  ...args: Args
) => Return

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
export function decorateAll<This extends object, Args extends unknown[], Return>(
  methodDecorator: (
    method: Method<This, Args, Return>,
    context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>,
  ) => void,
) {
  return function decorator(classTarget: Constructor<This>) {
    const prototype = classTarget.prototype as Record<string, unknown>
    const methodNames = Object.getOwnPropertyNames(prototype).filter(
      (name) => name !== 'constructor',
    )

    for (const methodName of methodNames) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName)
      const isGetter = !!descriptor?.get
      const isSetter = !!descriptor?.set
      if (!descriptor || isGetter || isSetter) {
        continue
      }

      const method = prototype[methodName] as Method<This, Args, Return>
      if (typeof method !== 'function') {
        continue
      }

      const methodContext = {
        name: methodName,
        kind: 'method' as const,
        static: false,
        private: false,
        addInitializer: () => {},
        access: {
          has: () => true,
          get: () => method,
        },
        metadata: {},
      } satisfies ClassMethodDecoratorContext<This, Method<This, Args, Return>>

      Object.defineProperty(prototype, methodName, {
        value: methodDecorator(method, methodContext),
        writable: true,
        enumerable: true,
        configurable: true,
      })
    }
  }
}
