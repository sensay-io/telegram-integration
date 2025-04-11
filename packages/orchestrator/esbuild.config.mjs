import process from 'node:process'
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
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORGANIZATION,
      project: process.env.SENTRY_PROJECT,
      debug: true,
      telemetry: false,
      sourcemaps: {
        assets: ['dist/**/*.js', 'dist/**/*.js.map'],
      },
    }),
  ],
})
