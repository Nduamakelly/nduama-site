import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { journaliser } from '../audit.js';

const siteSchema = z.object({
  code: z.string().min(1).max(16).regex(/^[A-Z0-9-]+$/, 'Code en majuscules, chiffres et tirets.'),
  nom: z.string().min(1),
  zea: z.string().nullish(),
  territoire: z.string().nullish(),
  province: z.string().nullish(),
  demonstration: z.boolean().optional(),
});

const uniteSchema = z.object({
  code: z.string().min(1).max(8),
  libelle: z.string().min(1),
  decimales: z.number().int().min(0).max(6).optional(),
  facteurKg: z.union([z.number(), z.string()]).nullish(),
});

export async function routesReferentiels(app: FastifyInstance, opts: { db: Db }): Promise<void> {
  const { db } = opts;
  const admin = { preHandler: [app.exigerRole('ADMIN')] };
  const connecte = { preHandler: [app.authentifier] };

  // --- Sites ------------------------------------------------------------
  app.get('/api/sites', connecte, async () =>
    db.selectFrom('sites').selectAll().where('deleted_at', 'is', null).orderBy('code').execute(),
  );

  app.post('/api/sites', admin, async (req, rep) => {
    const parse = siteSchema.safeParse(req.body);
    if (!parse.success) return rep.code(400).send({ erreur: parse.error.issues[0]?.message });
    const d = parse.data;
    const site = await db
      .insertInto('sites')
      .values({
        id: randomUUID(),
        code: d.code,
        nom: d.nom,
        zea: d.zea ?? null,
        territoire: d.territoire ?? null,
        province: d.province ?? null,
        demonstration: d.demonstration ?? false,
        created_by: req.user.sub,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await journaliser(db, {
      entite: 'sites', entiteId: site.id, action: 'CREATION',
      nouvelleValeur: site, utilisateurId: req.user.sub, adresseIp: req.ip,
    });
    return rep.code(201).send(site);
  });

  // --- Unités -----------------------------------------------------------
  app.get('/api/unites', connecte, async () =>
    db.selectFrom('unites').selectAll().where('deleted_at', 'is', null).orderBy('code').execute(),
  );

  app.post('/api/unites', admin, async (req, rep) => {
    const parse = uniteSchema.safeParse(req.body);
    if (!parse.success) return rep.code(400).send({ erreur: parse.error.issues[0]?.message });
    const d = parse.data;
    const unite = await db
      .insertInto('unites')
      .values({
        id: randomUUID(),
        code: d.code,
        libelle: d.libelle,
        decimales: d.decimales ?? 3,
        facteur_kg: d.facteurKg ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await journaliser(db, {
      entite: 'unites', entiteId: unite.id, action: 'CREATION',
      nouvelleValeur: unite, utilisateurId: req.user.sub, adresseIp: req.ip,
    });
    return rep.code(201).send(unite);
  });

  // --- Paramètres -------------------------------------------------------
  app.get('/api/parametres', connecte, async (req) => {
    const siteId = (req.query as { siteId?: string }).siteId ?? null;
    let q = db.selectFrom('parametres').selectAll();
    q = siteId
      ? q.where((eb) => eb.or([eb('site_id', 'is', null), eb('site_id', '=', siteId)]))
      : q.where('site_id', 'is', null);
    return q.orderBy('cle').execute();
  });

  app.put('/api/parametres/:cle', admin, async (req, rep) => {
    const { cle } = req.params as { cle: string };
    const body = z
      .object({ valeur: z.unknown(), siteId: z.string().uuid().nullish() })
      .safeParse(req.body);
    if (!body.success) return rep.code(400).send({ erreur: 'Requête invalide.' });
    const siteId = body.data.siteId ?? null;

    const avant = await db
      .selectFrom('parametres')
      .selectAll()
      .where('cle', '=', cle)
      .where('site_id', siteId === null ? 'is' : '=', siteId)
      .executeTakeFirst();

    const valeurJson = JSON.stringify(body.data.valeur ?? null);
    const apres = avant
      ? await db.updateTable('parametres')
          .set({ valeur: valeurJson, updated_at: new Date(), updated_by: req.user.sub })
          .where('cle', '=', cle)
          .where('site_id', siteId === null ? 'is' : '=', siteId)
          .returningAll().executeTakeFirstOrThrow()
      : await db.insertInto('parametres')
          .values({
            cle, valeur: valeurJson,
            portee: siteId ? 'SITE' : 'GLOBAL', site_id: siteId,
            updated_by: req.user.sub,
          })
          .returningAll().executeTakeFirstOrThrow();

    await journaliser(db, {
      entite: 'parametres', action: avant ? 'MODIFICATION' : 'CREATION',
      ancienneValeur: avant?.valeur ?? null, nouvelleValeur: apres.valeur,
      utilisateurId: req.user.sub, motif: cle, adresseIp: req.ip,
    });
    return apres;
  });
}
