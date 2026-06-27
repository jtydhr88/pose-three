import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: ['src/core/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/__tests__/**',
        'src/core/index.ts',

        'src/core/PoseEditor.ts',
        'src/core/ExportManager.ts',
        'src/core/openpose.ts',
        'src/core/OutlineEffect.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
  resolve: {
    alias: {
      'pose-three': resolve(__dirname, 'src/index.ts'),
    },
  },
})
