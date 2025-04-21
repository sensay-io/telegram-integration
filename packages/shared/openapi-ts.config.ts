import { defaultPlugins, defineConfig } from '@hey-api/openapi-ts'

export default defineConfig({
  input: 'https://api.sensay.io/schema',
  output: {
    format: 'biome',
    path: './src/api-client',
    clean: false,
    indexFile: false,
  },

  plugins: [
    ...defaultPlugins,
    '@hey-api/transformers',
    {
      name: '@hey-api/sdk',
      transformer: true,
      client: '@hey-api/client-fetch',
    },
    {
      type: 'json',
      name: '@hey-api/schemas',
    },
    {
      enums: 'javascript',
      name: '@hey-api/typescript',
    },
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/api-client/runtime-config.ts',
      throwOnError: true,
    },
  ],
})
