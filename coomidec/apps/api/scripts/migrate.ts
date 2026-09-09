/**
 * Applique les migrations SQL dans l'ordre, une seule fois chacune.
 * Chaque fichier tourne dans sa propre transaction : une migration
 * qui échoue ne laisse jamais le schéma à moitié appliqué.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrer(databaseUrl: string): Promise<string[]> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const appliquees: string[] = [];
  try {
    // Verrou consultatif : deux instances qui démarrent en même temps ne
    // doivent pas appliquer la même migration deux fois.
    await client.query('SELECT pg_advisory_lock($1)', [727_2026]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        nom         TEXT PRIMARY KEY,
        appliquee_le TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);

    const { rows } = await client.query<{ nom: string }>('SELECT nom FROM migrations');
    const deja = new Set(rows.map((r) => r.nom));
    const fichiers = (await readdir(DOSSIER)).filter((f) => f.endsWith('.sql')).sort();

    for (const fichier of fichiers) {
      if (deja.has(fichier)) continue;
      const sql = await readFile(join(DOSSIER, fichier), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO migrations (nom) VALUES ($1)', [fichier]);
        await client.query('COMMIT');
        appliquees.push(fichier);
        console.log(`  ✓ ${fichier}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${fichier} : ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (appliquees.length === 0) console.log('  Schéma déjà à jour.');
    return appliquees;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [727_2026]).catch(() => undefined);
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL est requis.');
    process.exit(1);
  }
  migrer(url).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
