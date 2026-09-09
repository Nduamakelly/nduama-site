import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import type { Db } from '../db/index.js';

export async function routesSante(app: FastifyInstance, opts: { db: Db }): Promise<void> {
  // Sonde utilisée par la tablette : l'événement `online` du navigateur ment
  // souvent (Wi-Fi capté sans Internet), cette route tranche.
  app.get('/api/sante', async (_req, rep) => {
    try {
      await sql`SELECT 1`.execute(opts.db);
      return { statut: 'OK', heureServeur: new Date().toISOString() };
    } catch {
      return rep.code(503).send({ statut: 'BASE_INDISPONIBLE' });
    }
  });
}
