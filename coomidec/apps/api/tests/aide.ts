import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { construireApp } from '../src/app.js';
import { creerDb, type Db } from '../src/db/index.js';
import { hacher } from '../src/auth/hash.js';
import { migrer } from '../scripts/migrate.js';
import type { RoleUtilisateur } from '../src/db/types.js';

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://coomidec:coomidec@localhost:5432/coomidec_test';

export const CONFIG = {
  DATABASE_URL,
  JWT_SECRET: 'secret-de-test-uniquement-pour-la-ci',
  PORT: 0,
  HOST: '127.0.0.1',
  NODE_ENV: 'test' as const,
  JWT_EXPIRATION: '1h',
  FUSEAU_HORAIRE: 'Africa/Lubumbashi',
};

/** Vide les tables métier entre deux tests, en respectant les dépendances. */
export async function nettoyer(db: Db): Promise<void> {
  await sql`
    TRUNCATE operations, clotures_journalieres, creuseurs, baremes_teneur,
             matieres_premieres, parametres, audit_logs, devices,
             utilisateurs, unites, sites, idempotency_keys
    RESTART IDENTITY CASCADE
  `.execute(db);
}

export async function preparer() {
  await migrer(DATABASE_URL);
  const db = creerDb(DATABASE_URL);
  await nettoyer(db);
  const { app } = await construireApp(CONFIG, db);
  await app.ready();
  return { app, db };
}

export async function creerUtilisateur(
  db: Db,
  role: RoleUtilisateur,
  identifiant = `u-${role.toLowerCase()}`,
): Promise<{ id: string; identifiant: string; motDePasse: string }> {
  const motDePasse = 'MotDePasse!2026';
  const id = randomUUID();
  await db
    .insertInto('utilisateurs')
    .values({
      id,
      identifiant,
      nom_complet: `Test ${role}`,
      role,
      mot_de_passe_hash: await hacher(motDePasse),
    })
    .execute();
  return { id, identifiant, motDePasse };
}

export async function jetonPour(
  app: Awaited<ReturnType<typeof preparer>>['app'],
  identifiant: string,
  motDePasse: string,
): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/connexion',
    payload: { identifiant, motDePasse },
  });
  return (r.json() as { jeton: string }).jeton;
}

export const bearer = (jeton: string) => ({ authorization: `Bearer ${jeton}` });
