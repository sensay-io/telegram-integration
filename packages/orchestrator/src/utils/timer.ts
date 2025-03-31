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
  return new Promise<T>((resolve, reject) => {
    const timeoutID = setTimeout(() => {
      cleanup()
      reject(new Error(`Timeout after ${timeoutMs}ms`))
    }, timeoutMs)

    const cleanup = fn((value) => {
      clearTimeout(timeoutID)
      cleanup()
      resolve(value)
    })
  })
}
