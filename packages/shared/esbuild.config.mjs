import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/index.ts'],
  outdir: 'dist',
  packages: 'bundle',
  target: 'node22',
  platform: 'node',
  format: 'esm',
  bundle: true,
  keepNames: true,
  sourcemap: true,
})
