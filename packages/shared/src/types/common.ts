export const assertNever: (x: never) => never = (x) => {
  throw new Error(`Unexpected object: ${x}`)
}

export type Subset<T extends U, U> = U
