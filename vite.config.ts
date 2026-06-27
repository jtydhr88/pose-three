import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

export default defineConfig(({ mode }) => {
  if (mode === 'lib') {
    return {
      plugins: [
        dts({
          entryRoot: 'src',
          include: ['src/**/*.ts'],
          exclude: ['src/**/*.test.ts'],
          rollupTypes: true,
        }),
      ],
      build: {
        emptyOutDir: true,
        sourcemap: true,
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          name: 'PoseThree',
          fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
          formats: ['es', 'cjs'],
        },
        rollupOptions: {

          external: [/^three(\/.*)?$/],
          output: {
            globals: { three: 'THREE' },
          },
        },
      },
    }
  }

  return {
    root: resolve(__dirname, 'playground'),
    base: process.env.VITE_BASE ?? '/pose-three/',
    build: {
      outDir: resolve(__dirname, 'dist-site'),
      emptyOutDir: true,
    },
    resolve: {
      alias: {
        'pose-three': resolve(__dirname, 'src/index.ts'),
      },
    },
  }
})
