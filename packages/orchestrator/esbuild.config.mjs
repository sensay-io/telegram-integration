import process from 'node:process'
import { sentryEsbuildPlugin } from '@sentry/esbuild-plugin'
import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/index.ts', 'src/start_worker.ts'],
  outdir: 'dist',
  packages: 'bundle',
  target: 'node22',
  platform: 'node',
  format: 'esm',
  bundle: true,
  keepNames: true,
  sourcemap: true,
  logOverride: {
    // webidl-conversions package generates some warnings that we can ignore
    'equals-negative-zero': 'info',
    // @grammyjs/transformer-throttler package generates some warnings that we can ignore
    'direct-eval': 'info',
  },
  banner: {
    // https://github.com/evanw/esbuild/pull/2067#issuecomment-1152399288
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  plugins: [
    sentryEsbuildPlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORGANIZATION,
      project: process.env.SENTRY_PROJECT,
      telemetry: false,
      debug: true,
      sourcemaps: {
        assets: ['dist/**/*.js', 'dist/**/*.js.map'],
      },
    }),
  ],
})
