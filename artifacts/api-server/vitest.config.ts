import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 10000,
    env: {
      NODE_ENV: 'test',
      DEV_AUTH_BYPASS: 'true',
    },
  },
  resolve: {
    alias: {
      '@workspace/api-zod': path.resolve(__dirname, '../../lib/api-zod/src/index.ts'),
      '@workspace/db': path.resolve(__dirname, '../../lib/db/src/client.ts'),
      '@workspace/safety-core': path.resolve(__dirname, '../../lib/safety-core/src/index.ts'),
    },
  },
});
