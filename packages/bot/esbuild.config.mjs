import fs from 'node:fs'
import * as esbuild from 'esbuild'

const result = await esbuild.build({
  entryPoints: ['src/index.ts', 'src/cli.ts'],
  outdir: 'dist',
  packages: 'external',
  target: 'node22',
  platform: 'node',
  format: 'esm',
  bundle: true,
  minify: true,
  treeShaking: true,
  metafile: true,
  keepNames: true,
  sourcemap: true,
})

fs.writeFileSync('dist/meta.json', JSON.stringify(result.metafile))
