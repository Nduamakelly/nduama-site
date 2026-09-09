import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { calculerOperation, verifierBareme, type BaremeTranche } from '@coomidec/core';
import type { Db } from '../db/index.js';
import type { Bareme, Matiere } from '../db/types.js';
import { journaliser } from '../audit.js';

const num = z.union([z.number(), z.string()]);

const trancheSchema = z.object({
  teneurMin: num,
  teneurMax: num,
  coutUnitaire: num,
  pctCout: num.optional(),
  devise: z.string().length(3).optional(),
  motif: z.string().nullish(),
});

/** Traduit une ligne de barème en entrée du moteur de calcul partagé. */
function versCore(b: Bareme): BaremeTranche {
  return {
    id: b.id,
    matiereId: b.matiere_id,
    teneurMin: b.teneur_min,
    teneurMax: b.teneur_max,
    coutUnitaire: b.cout_unitaire,
    pctCout: b.pct_cout,
    devise: b.devise,
    valideDu: new Date(b.valide_du).toISOString(),
    valideAu: b.valide_au ? new Date(b.valide_au).toISOString() : null,
    versionBareme: b.version_bareme,
  };
}

function matiereVersCore(m: Matiere, uniteCode: string) {
  return {
    id: m.id,
    code: m.code,
    nom: m.nom,
    methode: m.methode_calcul,
    prixParPourcent: m.prix_par_pourcent,
    pctCoutDefaut: m.pct_cout_defaut,
    formule: m.formule,
    devise: m.devise,
    uniteCode,
    decimalesMontant: m.decimales_montant,
  };
}

export async function routesBaremes(app: FastifyInstance, opts: { db: Db }): Promise<void> {
  const { db } = opts;
  const admin = { preHandler: [app.exigerRole('ADMIN')] };
  const connecte = { preHandler: [app.authentifier] };

  /** Tranches d'une matière. `?historique=1` inclut les tranches fermées. */
  app.get('/api/matieres/:id/baremes', connecte, async (req) => {
    const { id } = req.params as { id: string };
    const historique = (req.query as { historique?: string }).historique === '1';
    let q = db.selectFrom('baremes_teneur').selectAll().where('matiere_id', '=', id);
    if (!historique) q = q.where('valide_au', 'is', null);
    const lignes = await q.orderBy('teneur_min').orderBy('valide_du').execute();
    return {
      baremes: lignes,
      problemes: verifierBareme(lignes.map(versCore), id),
    };
  });

  app.post('/api/matieres/:id/baremes', admin, async (req, rep) => {
    const { id } = req.params as { id: string };
    const parse = trancheSchema.safeParse(req.body);
    if (!parse.success) return rep.code(400).send({ erreur: parse.error.issues[0]?.message });
    const d = parse.data;

    const matiere = await db
      .selectFrom('matieres_premieres').select(['id', 'devise'])
      .where('id', '=', id).where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!matiere) return rep.code(404).send({ erreur: 'Matière première inconnue.' });

    try {
      const tranche = await db
        .insertInto('baremes_teneur')
        .values({
          id: randomUUID(),
          matiere_id: id,
          teneur_min: d.teneurMin,
          teneur_max: d.teneurMax,
          cout_unitaire: d.coutUnitaire,
          pct_cout: d.pctCout ?? 1,
          devise: d.devise ?? matiere.devise,
          motif: d.motif ?? null,
          created_by: req.user.sub,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await journaliser(db, {
        entite: 'baremes_teneur', entiteId: tranche.id, action: 'CHANGEMENT_TARIF',
        nouvelleValeur: tranche, motif: d.motif ?? null,
        utilisateurId: req.user.sub, adresseIp: req.ip,
      });
      return rep.code(201).send(tranche);
    } catch (e) {
      // La contrainte EXCLUDE de la base est la source de vérité, pas le code applicatif.
      if (e instanceof Error && e.message.includes('baremes_sans_chevauchement')) {
        return rep.code(409).send({
          erreur:
            'Cette tranche en chevauche une autre déjà active pour cette matière. ' +
            'Fermez d abord la tranche existante.',
        });
      }
      throw e;
    }
  });

  /**
   * Changer un tarif : la tranche courante est FERMÉE et une nouvelle est ouverte.
   * Aucune modification en place — c'est ce qui garantit le TEST 3.
   */
  app.put('/api/baremes/:id', admin, async (req, rep) => {
    const { id } = req.params as { id: string };
    const parse = trancheSchema.partial().extend({ motif: z.string().min(1) }).safeParse(req.body);
    if (!parse.success) {
      return rep.code(400).send({
        erreur: parse.error.issues[0]?.message ?? 'Un changement de tarif exige un motif.',
      });
    }
    const d = parse.data;

    const ancienne = await db
      .selectFrom('baremes_teneur').selectAll().where('id', '=', id).executeTakeFirst();
    if (!ancienne) return rep.code(404).send({ erreur: 'Tranche inconnue.' });
    if (ancienne.valide_au !== null) {
      return rep.code(409).send({ erreur: 'Cette tranche est déjà fermée : un tarif historisé est immuable.' });
    }

    const nouvelle = await db.transaction().execute(async (trx) => {
      const maintenant = new Date();
      await trx.updateTable('baremes_teneur')
        .set({ valide_au: maintenant })
        .where('id', '=', id).where('valide_au', 'is', null)
        .execute();
      return trx.insertInto('baremes_teneur')
        .values({
          id: randomUUID(),
          matiere_id: ancienne.matiere_id,
          teneur_min: d.teneurMin ?? ancienne.teneur_min,
          teneur_max: d.teneurMax ?? ancienne.teneur_max,
          cout_unitaire: d.coutUnitaire ?? ancienne.cout_unitaire,
          pct_cout: d.pctCout ?? ancienne.pct_cout,
          devise: d.devise ?? ancienne.devise,
          valide_du: maintenant,
          version_bareme: ancienne.version_bareme + 1,
          motif: d.motif,
          created_by: req.user.sub,
        })
        .returningAll().executeTakeFirstOrThrow();
    });

    await journaliser(db, {
      entite: 'baremes_teneur', entiteId: nouvelle.id, action: 'CHANGEMENT_TARIF',
      ancienneValeur: ancienne, nouvelleValeur: nouvelle,
      motif: d.motif, utilisateurId: req.user.sub, adresseIp: req.ip,
    });

    return {
      ancienne: { id: ancienne.id, ferme_le: nouvelle.valide_du },
      nouvelle,
      avertissement: 'Les opérations déjà enregistrées conservent leur ancien calcul.',
    };
  });

  /**
   * Simulateur de l'écran PARAMÈTRES : « teneur 3,2 % → 448 USD le point,
   * montant 5 600 USD ». Utilise exactement le même moteur que la tablette.
   */
  app.post('/api/matieres/:id/simuler', connecte, async (req, rep) => {
    const { id } = req.params as { id: string };
    const parse = z.object({ qty: num, teneur: num }).safeParse(req.body);
    if (!parse.success) return rep.code(400).send({ erreur: 'Fournissez une QTY et une teneur.' });

    const matiere = await db
      .selectFrom('matieres_premieres').selectAll()
      .where('id', '=', id).where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!matiere) return rep.code(404).send({ erreur: 'Matière première inconnue.' });

    const unite = await db
      .selectFrom('unites').select('code').where('id', '=', matiere.unite_id).executeTakeFirst();

    const baremes = await db
      .selectFrom('baremes_teneur').selectAll()
      .where('matiere_id', '=', id).where('valide_au', 'is', null)
      .execute();

    return calculerOperation({
      qty: parse.data.qty as string,
      teneur: parse.data.teneur as string,
      matiere: matiereVersCore(matiere, unite?.code ?? '?'),
      baremes: baremes.map(versCore),
      calculeA: new Date().toISOString(),
    });
  });
}
