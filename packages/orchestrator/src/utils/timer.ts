/**
 * Runs a function with a timeout.
 *
 * @param fn - The function to run.
 * @param timeoutMs - The timeout in milliseconds.
 * @returns The result of the function.
 */
export async function withTimeout<T>(
  fn: (resolve: (value: T) => void) => () => void,
  timeoutMs: number,
): Promise<T> {
  // Create error here to preserve stack trace
  const error = new TimeoutError(`Timeout after ${timeoutMs}ms`)

  return new Promise<T>((resolve, reject) => {
    const timeoutID = setTimeout(() => {
      cleanup()
      reject(error)
    }, timeoutMs)

    const cleanup = fn((value) => {
      clearTimeout(timeoutID)
      cleanup()
      resolve(value)
    })
  })
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = TimeoutError.name
    Error.captureStackTrace(this, TimeoutError)
  }
}
