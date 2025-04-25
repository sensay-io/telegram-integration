import { client } from './client.gen'
import { configureInterceptors } from './runtime-config'
export * from './runtime-config'
export * from './types.gen'
export * from './sdk.gen'

configureInterceptors(client)

export { client }
