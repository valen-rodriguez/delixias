import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.spec.ts', '__tests__/**/*.spec.tsx'],
    coverage: {
      provider: 'v8',
      include: [
        'src/utils/**',
        'src/services/**',
        'src/navigation/roleSwitchGate.ts',
        'src/navigation/shellDerivation.ts',
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
