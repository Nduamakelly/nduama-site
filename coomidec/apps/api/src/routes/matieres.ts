import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validerFormule, variablesUtilisees, VARIABLES_AUTORISEES } from '@coomidec/core';
import type { Db } from '../db/index.js';
import { journaliser } from '../audit.js';

const num = z.union([z.number(), z.string()]);

const matiereSchema = z.object({
  code: z.string().min(1).max(16),
  nom: z.string().min(1),
  uniteId: z.string().uuid(),
  methodeCalcul: z.enum(['PRIX_PAR_POURCENT', 'BAREME_TRANCHES']),
  prixParPourcent: num.nullish(),
  pctCoutDefaut: num.optional(),
  formule: z.string().nullish(),
  devise: z.string().length(3).optional(),
  decimalesMontant: z.number().int().min(0).max(6).optional(),
});

/** Une formule invalide ne doit jamais atteindre la base : elle bloquerait la saisie. */
function controlerFormule(formule: string | null | undefined): string | null {
  if (!formule || !formule.trim()) return null;
  const v = validerFormule(formule);
  if (!v.valide) return v.erreur ?? 'Formule invalide.';
  return null;
}

export async function routesMatieres(app: FastifyInstance, opts: { db: Db }): Promise<void> {
  const { db } = opts;
  const admin = { preHandler: [app.exigerRole('ADMIN')] };
  const connecte = { preHandler: [app.authentifier] };

  app.get('/api/matieres', connecte, async () =>
    db.selectFrom('matieres_premieres').selectAll()
      .where('deleted_at', 'is', null).orderBy('nom').execute(),
  );

  app.get('/api/matieres/variables', connecte, async () => ({
    variables: VARIABLES_AUTORISEES,
    fonctions: ['min(a,b)', 'max(a,b)', 'arrondi(x,n)', 'plafond(x)', 'plancher(x)', 'abs(x)'],
    formulesParDefaut: {
      PRIX_PAR_POURCENT: 'QTY * VALEUR_TENEUR * PCT_COUT',
      BAREME_TRANCHES: 'QTY * COUT_UNITAIRE * PCT_COUT',
    },
  }));

  app.post('/api/matieres', admin, async (req, rep) => {
    const parse = matiereSchema.safeParse(req.body);
    if (!parse.success) return rep.code(400).send({ erreur: parse.error.issues[0]?.message });
    const d = parse.data;

    const erreurFormule = controlerFormule(d.formule);
    if (erreurFormule) return rep.code(400).send({ erreur: erreurFormule });

    if (d.methodeCalcul === 'PRIX_PAR_POURCENT' && (d.prixParPourcent ?? null) === null) {
      return rep.code(400).send({
        erreur: 'La méthode « prix par 1 % » exige un prix de référence (ex. cuivre 1 % = 140 USD).',
      });
    }

    const matiere = await db
      .insertInto('matieres_premieres')
      .values({
        id: randomUUID(),
        code: d.code,
        nom: d.nom,
        unite_id: d.uniteId,
        methode_calcul: d.methodeCalcul,
        prix_par_pourcent: d.prixParPourcent ?? null,
        pct_cout_defaut: d.pctCoutDefaut ?? 1,
        formule: d.formule?.trim() || null,
        devise: d.devise ?? 'USD',
        decimales_montant: d.decimalesMontant ?? 2,
        created_by: req.user.sub,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await journaliser(db, {
      entite: 'matieres_premieres', entiteId: matiere.id, action: 'CREATION',
      nouvelleValeur: matiere, utilisateurId: req.user.sub, adresseIp: req.ip,
    });
    return rep.code(201).send(matiere);
  });

  /**
   * Modifier une matière. Changer `prix_par_pourcent` est un CHANGEMENT DE TARIF :
   * il exige un motif et laisse une trace, mais ne recalcule aucune opération
   * existante — chacune porte son propre snapshot.
   */
  app.patch('/api/matieres/:id', admin, async (req, rep) => {
    const { id } = req.params as { id: string };
    const parse = matiereSchema.partial().extend({ motif: z.string().nullish() }).safeParse(req.body);
    if (!parse.success) return rep.code(400).send({ erreur: parse.error.issues[0]?.message });
    const d = parse.data;

    const avant = await db
      .selectFrom('matieres_premieres').selectAll()
      .where('id', '=', id).where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!avant) return rep.code(404).send({ erreur: 'Matière première inconnue.' });

    if (d.formule !== undefined) {
      const erreurFormule = controlerFormule(d.formule);
      if (erreurFormule) return rep.code(400).send({ erreur: erreurFormule });
    }

    const tarifChange =
      d.prixParPourcent !== undefined &&
      String(d.prixParPourcent ?? '') !== String(avant.prix_par_pourcent ?? '');
    if (tarifChange && !d.motif) {
      return rep.code(400).send({ erreur: 'Un changement de tarif exige un motif.' });
    }

    const apres = await db
      .updateTable('matieres_premieres')
      .set({
        ...(d.nom !== undefined && { nom: d.nom }),
        ...(d.uniteId !== undefined && { unite_id: d.uniteId }),
        ...(d.prixParPourcent !== undefined && { prix_par_pourcent: d.prixParPourcent ?? null }),
        ...(d.pctCoutDefaut !== undefined && { pct_cout_defaut: d.pctCoutDefaut }),
        ...(d.formule !== undefined && { formule: d.formule?.trim() || null }),
        ...(d.devise !== undefined && { devise: d.devise }),
        ...(d.decimalesMontant !== undefined && { decimales_montant: d.decimalesMontant }),
        updated_at: new Date(),
        version: avant.version + 1,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    await journaliser(db, {
      entite: 'matieres_premieres',
      entiteId: id,
      action: tarifChange ? 'CHANGEMENT_TARIF' : 'MODIFICATION',
      ancienneValeur: avant,
      nouvelleValeur: apres,
      motif: d.motif ?? null,
      utilisateurId: req.user.sub,
      adresseIp: req.ip,
    });

    return {
      ...apres,
      avertissement: tarifChange
        ? 'Les opérations déjà enregistrées conservent leur ancien calcul.'
        : undefined,
      variablesFormule: apres.formule ? variablesUtilisees(apres.formule) : undefined,
    };
  });
}
