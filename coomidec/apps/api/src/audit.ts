import type { Db } from './db/index.js';
import type { ActionAudit } from './db/types.js';

export interface EntreeAudit {
  entite: string;
  entiteId?: string | null;
  action: ActionAudit;
  ancienneValeur?: unknown;
  nouvelleValeur?: unknown;
  utilisateurId?: string | null;
  deviceId?: string | null;
  motif?: string | null;
  adresseIp?: string | null;
}

/**
 * Écrit une trace d'audit. La table est en ajout seul : ni `UPDATE`
 * ni `DELETE` n'y ont d'effet, y compris pour un administrateur de la base.
 */
export async function journaliser(db: Db, e: EntreeAudit): Promise<void> {
  await db
    .insertInto('audit_logs')
    .values({
      entite: e.entite,
      entite_id: e.entiteId ?? null,
      action: e.action,
      ancienne_valeur: e.ancienneValeur === undefined ? null : JSON.stringify(e.ancienneValeur),
      nouvelle_valeur: e.nouvelleValeur === undefined ? null : JSON.stringify(e.nouvelleValeur),
      utilisateur_id: e.utilisateurId ?? null,
      device_id: e.deviceId ?? null,
      motif: e.motif ?? null,
      adresse_ip: e.adresseIp ?? null,
    })
    .execute();
}
