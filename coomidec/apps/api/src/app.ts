import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { creerDb, type Db } from './db/index.js';
import { enregistrerAuth } from './auth/plugin.js';
import { routesSante } from './routes/sante.js';
import { routesAuth } from './routes/auth.js';
import { routesReferentiels } from './routes/referentiels.js';
import { routesMatieres } from './routes/matieres.js';
import { routesBaremes } from './routes/baremes.js';

export interface AppCoomidec {
  app: FastifyInstance;
  db: Db;
}

export async function construireApp(config: Config, dbFournie?: Db): Promise<AppCoomidec> {
  const db = dbFournie ?? creerDb(config.DATABASE_URL);
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: 'info' },
    // Une tablette qui synchronise un lot de 50 opérations avec signatures.
    bodyLimit: 12 * 1024 * 1024,
  });

  await enregistrerAuth(app, { secret: config.JWT_SECRET, expiration: config.JWT_EXPIRATION });

  await app.register(routesSante, { db });
  await app.register(routesAuth, { db });
  await app.register(routesReferentiels, { db });
  await app.register(routesMatieres, { db });
  await app.register(routesBaremes, { db });

  app.setErrorHandler((err: FastifyError, req, rep) => {
    req.log.error({ err }, 'erreur non gérée');
    const code = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    return rep.code(code).send({
      erreur: code === 500 ? 'Erreur interne du serveur.' : err.message,
    });
  });

  return { app, db };
}
