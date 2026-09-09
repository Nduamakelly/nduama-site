/**
 * Base locale de la tablette.
 *
 * `operations` et `outbox` vivent dans la MÊME base : c'est indispensable,
 * car Dexie ne peut ouvrir une transaction atomique qu'entre tables d'une
 * même base. Une opération enregistrée sans son entrée d'outbox serait
 * perdue pour la synchronisation ; l'inverse produirait un fantôme.
 */
import Dexie, { type Table } from 'dexie';
import type { SnapshotCalcul } from '@coomidec/core';

export type StatutSyncLocal = 'EN_ATTENTE' | 'EN_COURS' | 'SYNCHRONISE' | 'ERREUR' | 'CONFLIT';
export type StatutOperationLocal = 'BROUILLON' | 'A_VALIDER' | 'VALIDEE' | 'ANNULEE' | 'CLOTUREE';

export interface OperationLocale {
  id: string;                 // UUID généré sur l'appareil — identité définitive
  numero: string;             // COOMIDEC/KOL/20260909/A7F3-014 — stable dès la création
  siteId: string;
  siteCode: string;
  dateOperation: string;      // AAAA-MM-JJ, journée métier en heure locale du site
  heure: string;              // HH:MM:SS
  responsableId: string;
  responsableNom: string;
  creuseurId: string;         // obligatoire (décision D8)
  creuseurNom: string;
  equipe: string | null;
  matiereId: string;
  matiereNom: string;
  qty: string;
  uniteId: string;          // requis par le serveur (clé étrangère)
  uniteCode: string;
  teneur: string;
  observation: string | null;
  signature: string | null;   // data URL PNG
  montant: string | null;
  devise: string;
  calcul: SnapshotCalcul;
  statut: StatutOperationLocal;
  motifAnnulation: string | null;
  verrouillee: boolean;
  clotureId: string | null;
  heureAppareil: string;      // ISO, horloge de la tablette
  deviceId: string;
  version: number;
  syncStatus: StatutSyncLocal;
  createdAt: string;
  updatedAt: string;
}

export interface EntreeOutbox {
  seq?: number;               // auto-incrément : préserve l'ordre causal
  entite: 'operation' | 'cloture';
  entiteId: string;
  version: number;
  statut: StatutSyncLocal;
  tentatives: number;
  prochainEssaiLe: number;
  derniereErreur: string | null;
  creeLe: number;
}

export interface MatiereLocale {
  id: string; code: string; nom: string;
  methode: 'PRIX_PAR_POURCENT' | 'BAREME_TRANCHES';
  prixParPourcent: string | null;
  pctCoutDefaut: string;
  formule: string | null;
  devise: string;
  uniteId: string;
  uniteCode: string;
  decimalesMontant: number;
  actif: boolean;
}

export interface BaremeLocal {
  id: string; matiereId: string;
  teneurMin: string; teneurMax: string;
  coutUnitaire: string; pctCout: string;
  devise: string; valideDu: string; valideAu: string | null; versionBareme: number;
}

export interface CreuseurLocal {
  id: string; code: string;
  nom: string; postnom: string | null; prenom: string | null;
  telephone: string | null; numeroCarte: string | null;
  dateExpirationCarte: string | null;
  equipe: string | null; siteId: string; statut: 'ACTIF' | 'INACTIF';
  recherche: string;          // champ aplati, sans accents, pour la recherche rapide
}

export interface EnregistrementMeta {
  cle: string;
  valeur: unknown;
}

export class BaseCoomidec extends Dexie {
  operations!: Table<OperationLocale, string>;
  outbox!: Table<EntreeOutbox, number>;
  matieres!: Table<MatiereLocale, string>;
  baremes!: Table<BaremeLocal, string>;
  creuseurs!: Table<CreuseurLocal, string>;
  meta!: Table<EnregistrementMeta, string>;

  constructor(nom = 'coomidec') {
    super(nom);
    this.version(1).stores({
      operations: 'id, numero, [siteId+dateOperation], syncStatus, statut, creuseurId, matiereId',
      outbox: '++seq, entiteId, statut, prochainEssaiLe',
      matieres: 'id, code, actif',
      baremes: 'id, matiereId, [matiereId+valideAu]',
      creuseurs: 'id, code, statut, recherche',
      meta: 'cle',
    });
  }
}

export const db = new BaseCoomidec();

export async function lireMeta<T>(cle: string, defaut: T): Promise<T> {
  const r = await db.meta.get(cle);
  return r === undefined ? defaut : (r.valeur as T);
}

export async function ecrireMeta(cle: string, valeur: unknown): Promise<void> {
  await db.meta.put({ cle, valeur });
}
