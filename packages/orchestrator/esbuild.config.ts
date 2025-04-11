import { env } from 'node:process'
import { sentryEsbuildPlugin } from '@sentry/esbuild-plugin'
import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/index.ts', 'src/start_worker.ts'],
  outdir: 'dist',
  bundle: true,
  target: 'node22',
  platform: 'node',
  format: 'esm',
  packages: 'external',
  keepNames: true,
  sourcemap: true,
  plugins: [
    sentryEsbuildPlugin({
      authToken: env.SENTRY_AUTH_TOKEN,
      org: 'vpashkov',
      project: 'sensay-telegram-integrations',
      debug: true,
      sourcemaps: {
        assets: ['**/*.js.map'],
      },
    }),
  ],
})
