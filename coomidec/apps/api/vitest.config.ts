import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Les fichiers partagent une base PostgreSQL et se vident mutuellement
    // entre les tests : ils doivent s'exécuter l'un après l'autre.
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
