/**
 * Synchronisation : montée (push) et descente (pull).
 *
 * Trois protections superposées contre les doublons — c'est le TEST 2 :
 *   1. l'UUID est généré sur l'appareil : un renvoi vise la même ligne ;
 *   2. une clé d'idempotence `{id}:{version}` mémorise la réponse ;
 *   3. une garde de version en SQL empêche une charge périmée d'écraser
 *      une donnée plus récente.
 *
 * Le serveur ne fait jamais confiance au montant envoyé : il rejoue le
 * calcul à partir du snapshot transporté par l'opération et compare.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { verifierSnapshot, type SnapshotCalcul } from '@coomidec/core';
import type { Db } from '../db/index.js';
import { journaliser } from '../audit.js';

const num = z.union([z.number(), z.string()]);

const operationEntrante = z.object({
  id: z.string().uuid(),
  numero: z.string().min(1),
  siteId: z.string().uuid(),
  dateOperation: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  heure: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  responsableId: z.string().uuid(),
  creuseurId: z.string().uuid(),
  equipe: z.string().nullish(),
  matiereId: z.string().uuid(),
  qty: num,
  uniteId: z.string().uuid(),
  teneur: num,
  observation: z.string().nullish(),
  montant: num.nullish(),
  devise: z.string().min(1),
  calcul: z.record(z.unknown()),
  statut: z.enum(['BROUILLON', 'A_VALIDER', 'VALIDEE', 'ANNULEE', 'CLOTUREE', 'CORRIGEE']),
  motifAnnulation: z.string().nullish(),
  heureAppareil: z.string(),
  version: z.number().int().positive(),
});

const corpsPush = z.object({
  deviceId: z.string().uuid(),
  operations: z.array(operationEntrante).max(200),
});

type OperationEntrante = z.infer<typeof operationEntrante>;

export type ResultatItem =
  | { id: string; etat: 'APPLIQUEE'; version: number }
  | { id: string; etat: 'DEJA_APPLIQUEE'; version: number }
  | { id: string; etat: 'IGNOREE_VERSION_ANCIENNE'; versionServeur: number }
  | { id: string; etat: 'REJETEE'; motif: string };

export async function routesSync(app: FastifyInstance, opts: { db: Db }): Promise<void> {
  const { db } = opts;
  const connecte = { preHandler: [app.authentifier] };

  app.post('/api/sync/push', connecte, async (req, rep) => {
    const parse = corpsPush.safeParse(req.body);
    if (!parse.success) {
      return rep.code(400).send({ erreur: parse.error.issues[0]?.message ?? 'Lot invalide.' });
    }
    const { deviceId, operations } = parse.data;

    const appareil = await db
      .selectFrom('devices').select(['id', 'actif', 'site_id'])
      .where('id', '=', deviceId).executeTakeFirst();
    if (!appareil) return rep.code(403).send({ erreur: 'Appareil inconnu.' });
    if (!appareil.actif) {
      return rep.code(403).send({
        erreur: 'Appareil révoqué. Les données restent sur la tablette ; exportez la file de secours.',
      });
    }

    const resultats: ResultatItem[] = [];

    for (const op of operations) {
      const cle = `${op.id}:${op.version}`;

      // Protection 2 — rejeu exact : on renvoie la réponse mémorisée sans
      // rien réécrire.
      const memo = await db
        .selectFrom('idempotency_keys').select('reponse')
        .where('cle', '=', cle).executeTakeFirst();
      if (memo) {
        resultats.push(memo.reponse as ResultatItem);
        continue;
      }

      const resultat = await appliquer(db, op, deviceId, req.user.sub);
      resultats.push(resultat);

      await db.insertInto('idempotency_keys')
        .values({ cle, reponse: JSON.stringify(resultat) })
        .onConflict((oc) => oc.column('cle').doNothing())
        .execute();
    }

    const compte = (e: ResultatItem['etat']) => resultats.filter((r) => r.etat === e).length;
    await db.insertInto('lots_synchronisation').values({
      id: randomUUID(),
      device_id: deviceId,
      utilisateur_id: req.user.sub,
      nb_recus: operations.length,
      nb_appliques: compte('APPLIQUEE'),
      nb_ignores: compte('DEJA_APPLIQUEE') + compte('IGNOREE_VERSION_ANCIENNE'),
      nb_rejetes: compte('REJETEE'),
    }).execute();

    await db.updateTable('devices')
      .set({ derniere_sync: new Date() }).where('id', '=', deviceId).execute();

    return { heureServeur: new Date().toISOString(), resultats };
  });

  /**
   * Descente incrémentale. Les référentiels descendent AVANT que la tablette
   * n'envoie : un appareil qui saisirait avec un barème périmé doit d'abord
   * recevoir le barème à jour. Les opérations déjà enregistrées ne sont pas
   * recalculées pour autant — leur snapshot fait foi.
   */
  app.get('/api/sync/pull', connecte, async (req) => {
    const q = z.object({
      depuis: z.coerce.number().int().nonnegative().default(0),
      siteId: z.string().uuid().optional(),
      limite: z.coerce.number().int().positive().max(500).default(200),
    }).parse(req.query);

    // `sequence_serveur` est un BIGINT, transporté en `string` pour ne pas
    // buter sur la limite des entiers sûrs de JavaScript.
    const depuis = String(q.depuis);

    const [sites, unites, matieres, baremes, creuseurs, parametres] = await Promise.all([
      db.selectFrom('sites').selectAll().where('sequence_serveur', '>', depuis)
        .orderBy('sequence_serveur').limit(q.limite).execute(),
      db.selectFrom('unites').selectAll().where('sequence_serveur', '>', depuis)
        .orderBy('sequence_serveur').limit(q.limite).execute(),
      db.selectFrom('matieres_premieres').selectAll().where('sequence_serveur', '>', depuis)
        .orderBy('sequence_serveur').limit(q.limite).execute(),
      db.selectFrom('baremes_teneur').selectAll().where('sequence_serveur', '>', depuis)
        .orderBy('sequence_serveur').limit(q.limite).execute(),
      db.selectFrom('creuseurs').selectAll().where('sequence_serveur', '>', depuis)
        .$if(Boolean(q.siteId), (b) => b.where('site_id', '=', q.siteId!))
        .orderBy('sequence_serveur').limit(q.limite).execute(),
      db.selectFrom('parametres').selectAll().where('sequence_serveur', '>', depuis)
        .orderBy('sequence_serveur').limit(q.limite).execute(),
    ]);

    const lignes = [...sites, ...unites, ...matieres, ...baremes, ...creuseurs, ...parametres];
    const curseur = lignes.reduce(
      (max, l) => Math.max(max, Number((l as { sequence_serveur: string }).sequence_serveur)),
      q.depuis,
    );

    return {
      curseur,
      complet: lignes.length < q.limite,
      heureServeur: new Date().toISOString(),
      changements: { sites, unites, matieres, baremes, creuseurs, parametres },
    };
  });

  /** État de synchronisation d'un appareil — écran Synchronisation. */
  app.get('/api/sync/etat/:deviceId', connecte, async (req, rep) => {
    const { deviceId } = req.params as { deviceId: string };
    const appareil = await db.selectFrom('devices').selectAll()
      .where('id', '=', deviceId).executeTakeFirst();
    if (!appareil) return rep.code(404).send({ erreur: 'Appareil inconnu.' });
    const lots = await db.selectFrom('lots_synchronisation').selectAll()
      .where('device_id', '=', deviceId).orderBy('recu_le', 'desc').limit(10).execute();
    return { appareil, lots };
  });
}

/** Applique une opération, avec vérification du calcul et garde de version. */
async function appliquer(
  db: Db,
  op: OperationEntrante,
  deviceId: string,
  utilisateurId: string,
): Promise<ResultatItem> {
  // Le serveur rejoue le calcul à partir du snapshot TRANSPORTÉ, jamais du
  // barème courant : une opération de la semaine dernière reste vérifiable.
  const snapshot = op.calcul as unknown as SnapshotCalcul;
  if (op.montant !== null && op.montant !== undefined) {
    const v = verifierSnapshot(snapshot);
    if (!v.conforme) {
      return { id: op.id, etat: 'REJETEE', motif: v.motif ?? 'Calcul non reproductible.' };
    }
    if (String(op.montant) !== snapshot.montantArrondi) {
      return {
        id: op.id, etat: 'REJETEE',
        motif: `Montant transporté ${op.montant} incohérent avec le snapshot ${snapshot.montantArrondi}.`,
      };
    }
  }

  const existante = await db
    .selectFrom('operations').select(['id', 'version', 'verrouillee'])
    .where('id', '=', op.id).executeTakeFirst();

  if (existante) {
    if (existante.verrouillee) {
      return {
        id: op.id, etat: 'REJETEE',
        motif: 'Opération clôturée : une modification exige la procédure de correction contrôlée.',
      };
    }
    // Protection 3 — garde de version.
    if (op.version <= existante.version) {
      return { id: op.id, etat: 'DEJA_APPLIQUEE', version: existante.version };
    }
  }

  const heureAppareil = new Date(op.heureAppareil);
  const maintenant = new Date();
  const decalage = maintenant.getTime() - heureAppareil.getTime();

  const valeurs = {
    id: op.id,
    numero: op.numero,
    site_id: op.siteId,
    date_operation: op.dateOperation,
    heure: op.heure.length === 5 ? `${op.heure}:00` : op.heure,
    responsable_id: op.responsableId,
    creuseur_id: op.creuseurId,
    equipe: op.equipe ?? null,
    matiere_id: op.matiereId,
    qty: op.qty,
    unite_id: op.uniteId,
    teneur: op.teneur,
    observation: op.observation ?? null,
    montant: op.montant ?? null,
    devise: op.devise,
    calcul: JSON.stringify(op.calcul),
    statut: op.statut,
    motif_annulation: op.motifAnnulation ?? null,
    heure_appareil: heureAppareil,
    decalage_horloge_ms: decalage,
    created_by: op.responsableId,
    device_id: deviceId,
    sync_status: 'SYNCHRONISE' as const,
    version: op.version,
    updated_at: maintenant,
  };

  try {
    // Protection 1 — l'UUID vient de l'appareil : ce `ON CONFLICT` vise la
    // même ligne à chaque renvoi, il n'en crée jamais une seconde.
    await db.insertInto('operations')
      .values(valeurs)
      .onConflict((oc) =>
        oc.column('id').doUpdateSet(valeurs).where(sql`operations.version`, '<', op.version)
          .where('operations.verrouillee', '=', false),
      )
      .execute();
  } catch (e) {
    return {
      id: op.id, etat: 'REJETEE',
      motif: e instanceof Error ? nettoyer(e.message) : 'Écriture refusée.',
    };
  }

  await journaliser(db, {
    entite: 'operations',
    entiteId: op.id,
    action: existante ? 'MODIFICATION' : 'CREATION',
    nouvelleValeur: { numero: op.numero, montant: op.montant, statut: op.statut, version: op.version },
    utilisateurId,
    deviceId,
    motif: 'Synchronisation',
  });

  if (Math.abs(decalage) > 5 * 60_000) {
    await journaliser(db, {
      entite: 'devices', entiteId: deviceId, action: 'MODIFICATION',
      nouvelleValeur: { decalage_horloge_ms: decalage },
      motif: `Horloge de l'appareil décalée de ${Math.round(decalage / 1000)} s`,
      utilisateurId, deviceId,
    });
  }

  return { id: op.id, etat: 'APPLIQUEE', version: op.version };
}

/** Message de base lisible par un agent, sans détail interne. */
function nettoyer(message: string): string {
  if (message.includes('operations_creuseur_id_fkey')) return 'Creuseur inconnu du serveur.';
  if (message.includes('operations_matiere_id_fkey')) return 'Matière première inconnue du serveur.';
  if (message.includes('operations_site_id_fkey')) return 'Site inconnu du serveur.';
  if (message.includes('operations_numero_unique')) return 'Ce numéro existe déjà pour ce site et ce jour.';
  return 'Écriture refusée par le serveur.';
}
