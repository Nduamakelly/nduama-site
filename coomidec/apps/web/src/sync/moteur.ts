/**
 * Moteur de synchronisation de la tablette.
 *
 * Il vide la file d'attente en arrière-plan et n'a jamais le droit de bloquer,
 * ralentir ou faire échouer une saisie. Une opération n'est retirée de la file
 * qu'après un accusé serveur la nommant explicitement.
 */
import { db, type EntreeOutbox, type OperationLocale, type StatutSyncLocal } from '../db/dexie.ts';

export const TAILLE_LOT = 50;
export const MAX_TENTATIVES = 7;

/** 1 s → 2 → 4 → 8 → 30 → 2 min → 5 min, plafonné. */
const PALIERS_MS = [1_000, 2_000, 4_000, 8_000, 30_000, 120_000, 300_000];

/**
 * Gigue de ±20 % : sans elle, toutes les tablettes d'un site qui retrouvent
 * le réseau en même temps rappelleraient le serveur au même instant.
 */
export function delaiAvantNouvelEssai(tentatives: number, alea = Math.random()): number {
  const base = PALIERS_MS[Math.min(tentatives, PALIERS_MS.length - 1)] ?? 300_000;
  return Math.round(base * (0.8 + 0.4 * alea));
}

export type EtatItem = 'APPLIQUEE' | 'DEJA_APPLIQUEE' | 'IGNOREE_VERSION_ANCIENNE' | 'REJETEE';

export interface ReponsePush {
  heureServeur: string;
  resultats: { id: string; etat: EtatItem; motif?: string }[];
}

export interface Transport {
  push: (corps: { deviceId: string; operations: unknown[] }) => Promise<
    { ok: true; reponse: ReponsePush } | { ok: false; statut: number | null; message: string }
  >;
}

export interface ResultatSync {
  envoyees: number;
  confirmees: number;
  rejetees: number;
  reportees: number;
  message: string;
}

/** Transport HTTP réel. Une panne réseau devient un échec ordinaire, pas un crash. */
export function transportHttp(jeton: () => string | null, base = ''): Transport {
  return {
    async push(corps) {
      try {
        const r = await fetch(`${base}/api/sync/push`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            // Rejeu exact d'un lot : le serveur peut le reconnaître.
            'idempotency-key': corps.operations
              .map((o) => `${(o as OperationLocale).id}:${(o as OperationLocale).version}`)
              .join(','),
            ...(jeton() ? { authorization: `Bearer ${jeton()}` } : {}),
          },
          body: JSON.stringify(corps),
        });
        if (!r.ok) {
          const texte = await r.text().catch(() => '');
          return { ok: false, statut: r.status, message: texte.slice(0, 300) || `HTTP ${r.status}` };
        }
        return { ok: true, reponse: (await r.json()) as ReponsePush };
      } catch (e) {
        return { ok: false, statut: null, message: e instanceof Error ? e.message : 'Réseau indisponible' };
      }
    },
  };
}

function charge(op: OperationLocale): unknown {
  return {
    id: op.id, numero: op.numero, siteId: op.siteId,
    dateOperation: op.dateOperation, heure: op.heure,
    responsableId: op.responsableId, creuseurId: op.creuseurId, equipe: op.equipe,
    matiereId: op.matiereId, qty: op.qty, uniteId: op.uniteId, teneur: op.teneur,
    observation: op.observation, montant: op.montant, devise: op.devise,
    calcul: op.calcul, statut: op.statut, motifAnnulation: op.motifAnnulation,
    heureAppareil: op.heureAppareil, version: op.version,
  };
}

/** Éléments prêts à partir, dans l'ordre d'insertion (causalité préservée). */
export async function fileAEnvoyer(maintenant = Date.now()): Promise<EntreeOutbox[]> {
  const tous = await db.outbox.where('statut').anyOf('EN_ATTENTE', 'EN_COURS').toArray();
  return tous
    .filter((e) => e.prochainEssaiLe <= maintenant)
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .slice(0, TAILLE_LOT);
}

async function marquer(
  entree: EntreeOutbox,
  statut: StatutSyncLocal,
  patch: Partial<EntreeOutbox> = {},
): Promise<void> {
  if (entree.seq === undefined) return;
  await db.outbox.update(entree.seq, { statut, ...patch });
  await db.operations.update(entree.entiteId, { syncStatus: statut });
}

/**
 * Vide la file une fois. Retourne un résumé lisible pour l'écran
 * Synchronisation ; ne lève jamais.
 */
export async function synchroniser(
  transport: Transport,
  deviceId: string,
  maintenant = Date.now(),
  alea = Math.random,
): Promise<ResultatSync> {
  const file = await fileAEnvoyer(maintenant);
  if (file.length === 0) {
    return { envoyees: 0, confirmees: 0, rejetees: 0, reportees: 0, message: 'Rien à synchroniser.' };
  }

  const operations: unknown[] = [];
  const parId = new Map<string, EntreeOutbox>();
  for (const e of file) {
    const op = await db.operations.get(e.entiteId);
    if (!op) {
      // L'opération a disparu : l'entrée de file n'a plus d'objet.
      if (e.seq !== undefined) await db.outbox.delete(e.seq);
      continue;
    }
    operations.push(charge(op));
    parId.set(op.id, e);
  }
  if (operations.length === 0) {
    return { envoyees: 0, confirmees: 0, rejetees: 0, reportees: 0, message: 'Rien à synchroniser.' };
  }

  for (const e of parId.values()) await marquer(e, 'EN_COURS');

  const r = await transport.push({ deviceId, operations });

  if (!r.ok) {
    // Un 4xx est une erreur de fond : réessayer à l'identique ne changera rien.
    const definitif = r.statut !== null && r.statut >= 400 && r.statut < 500;
    let reportees = 0;
    for (const e of parId.values()) {
      const tentatives = e.tentatives + 1;
      const abandon = definitif || tentatives >= MAX_TENTATIVES;
      await marquer(e, abandon ? 'ERREUR' : 'EN_ATTENTE', {
        tentatives,
        derniereErreur: r.message,
        prochainEssaiLe: abandon ? maintenant : maintenant + delaiAvantNouvelEssai(tentatives, alea()),
      });
      if (!abandon) reportees++;
    }
    return {
      envoyees: operations.length, confirmees: 0, rejetees: definitif ? parId.size : 0,
      reportees,
      message: definitif
        ? `Refusé par le serveur : ${r.message}`
        : `Réseau indisponible. Nouvel essai automatique. (${r.message})`,
    };
  }

  let confirmees = 0;
  let rejetees = 0;
  const confirmes = new Set<string>();

  for (const res of r.reponse.resultats) {
    const e = parId.get(res.id);
    if (!e) continue;
    confirmes.add(res.id);

    if (res.etat === 'REJETEE') {
      rejetees++;
      await marquer(e, 'ERREUR', { derniereErreur: res.motif ?? 'Rejetée par le serveur.' });
      continue;
    }
    // Confirmée : l'entrée quitte la file, et seulement maintenant.
    confirmees++;
    if (e.seq !== undefined) await db.outbox.delete(e.seq);
    await db.operations.update(e.entiteId, { syncStatus: 'SYNCHRONISE' });
  }

  // Une opération envoyée mais absente de l'accusé reste en file : mieux vaut
  // un doublon rattrapé par l'idempotence qu'une opération perdue.
  let reportees = 0;
  for (const [id, e] of parId) {
    if (confirmes.has(id)) continue;
    reportees++;
    const tentatives = e.tentatives + 1;
    await marquer(e, tentatives >= MAX_TENTATIVES ? 'ERREUR' : 'EN_ATTENTE', {
      tentatives,
      derniereErreur: "Le serveur n'a pas accusé réception de cette opération.",
      prochainEssaiLe: maintenant + delaiAvantNouvelEssai(tentatives, alea()),
    });
  }

  return {
    envoyees: operations.length,
    confirmees,
    rejetees,
    reportees,
    message:
      rejetees > 0
        ? `${confirmees} synchronisée(s), ${rejetees} rejetée(s) — voir le détail.`
        : `${confirmees} opération(s) synchronisée(s).`,
  };
}

/** Remet en file un élément en erreur, à la demande de l'agent. */
export async function reessayer(seq: number, maintenant = Date.now()): Promise<void> {
  const e = await db.outbox.get(seq);
  if (!e) return;
  await db.outbox.update(seq, {
    statut: 'EN_ATTENTE', tentatives: 0, prochainEssaiLe: maintenant, derniereErreur: null,
  });
  await db.operations.update(e.entiteId, { syncStatus: 'EN_ATTENTE' });
}

/** Export de secours : une tablette qui ne joint plus le serveur reste récupérable. */
export async function exporterFile(): Promise<string> {
  const entrees = await db.outbox.toArray();
  const operations = await db.operations
    .where('id').anyOf(entrees.map((e) => e.entiteId)).toArray();
  return JSON.stringify(
    { exporteLe: new Date().toISOString(), entrees, operations },
    null,
    2,
  );
}
