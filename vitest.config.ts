import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    // node env: every suite here is pure logic or server-side render.
    environment: 'node',
    // Tests live beside sources (lib/mint/*.test.ts) and in __tests__ dirs
    // (lib/geo/__tests__/*). Cover both, or half the suite silently vanishes.
    include: ['lib/**/*.test.ts', 'lib/**/__tests__/**/*.test.ts'],
  },
});
