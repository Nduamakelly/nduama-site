import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './types.js';

// NUMERIC et BIGINT en `string` : aucune perte de précision sur les montants.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => v);
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => v);
// DATE en `string` (AAAA-MM-JJ) : une journée métier n'est pas un instant UTC.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export function creerDb(databaseUrl: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString: databaseUrl, max: 10 }),
    }),
  });
}

export type Db = Kysely<Database>;
export type { Database };
