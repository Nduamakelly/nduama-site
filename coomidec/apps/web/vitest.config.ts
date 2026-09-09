import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Les specs Playwright vivent dans e2e/ et se lancent avec `npm run e2e`.
    // Sans cette exclusion, vitest tenterait de les exécuter lui-même.
    include: ['tests/**/*.test.ts'],
  },
});
