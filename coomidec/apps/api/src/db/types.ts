import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

/** PostgreSQL renvoie NUMERIC en `string` : on ne perd jamais de précision. */
type Num = ColumnType<string, string | number, string | number>;
type NumN = ColumnType<string | null, string | number | null, string | number | null>;
/** Colonne NUMERIC avec DEFAULT : omissible à l'insertion, numérique accepté. */
type NumGen = ColumnType<string, string | number | undefined, string | number>;
/** Rang global d'un changement : posé par la base, jamais par l'application. */
type Seq = ColumnType<string, never, never>;
type Date_ = ColumnType<Date, Date | string, Date | string>;
type DateN = ColumnType<Date | null, Date | string | null, Date | string | null>;

export type StatutSync = 'LOCAL' | 'EN_ATTENTE' | 'SYNCHRONISE' | 'ERREUR' | 'CONFLIT';
export type RoleUtilisateur = 'AGENT' | 'SUPERVISEUR' | 'ADMIN';
export type MethodeCalculDb = 'PRIX_PAR_POURCENT' | 'BAREME_TRANCHES';
export type StatutOperationDb = 'BROUILLON' | 'A_VALIDER' | 'VALIDEE' | 'ANNULEE' | 'CLOTUREE' | 'CORRIGEE';
export type ActionAudit =
  | 'CREATION' | 'MODIFICATION' | 'ANNULATION' | 'CLOTURE' | 'REOUVERTURE'
  | 'CORRECTION' | 'CHANGEMENT_TARIF' | 'CONNEXION' | 'REVOCATION_APPAREIL';

export interface SitesTable {
  sequence_serveur: Seq;
  id: string; code: string; nom: string;
  zea: string | null; territoire: string | null; province: string | null;
  actif: Generated<boolean>; demonstration: Generated<boolean>;
  created_at: Generated<Date>; updated_at: Generated<Date>;
  created_by: string | null; version: Generated<number>; deleted_at: DateN;
}

export interface UnitesTable {
  sequence_serveur: Seq;
  id: string; code: string; libelle: string;
  decimales: Generated<number>; facteur_kg: NumN; actif: Generated<boolean>;
  created_at: Generated<Date>; updated_at: Generated<Date>;
  version: Generated<number>; deleted_at: DateN;
}

export interface UtilisateursTable {
  id: string; identifiant: string; nom_complet: string;
  role: Generated<RoleUtilisateur>; mot_de_passe_hash: string; pin_hash: string | null;
  site_id: string | null; actif: Generated<boolean>;
  created_at: Generated<Date>; updated_at: Generated<Date>;
  created_by: string | null; version: Generated<number>; deleted_at: DateN;
}

export interface DevicesTable {
  id: string; libelle: string; site_id: string;
  enregistre_le: Generated<Date>; derniere_sync: DateN;
  actif: Generated<boolean>; revoque_le: DateN; revoque_par: string | null;
  created_at: Generated<Date>; updated_at: Generated<Date>; version: Generated<number>;
}

export interface MatieresPremieresTable {
  sequence_serveur: Seq;
  id: string; code: string; nom: string; unite_id: string;
  methode_calcul: MethodeCalculDb;
  prix_par_pourcent: NumN; pct_cout_defaut: NumGen;
  formule: string | null; devise: Generated<string>;
  decimales_montant: Generated<number>; actif: Generated<boolean>;
  created_at: Generated<Date>; updated_at: Generated<Date>;
  created_by: string | null; version: Generated<number>; deleted_at: DateN;
}

export interface BaremesTeneurTable {
  sequence_serveur: Seq;
  id: string; matiere_id: string;
  teneur_min: Num; teneur_max: Num; cout_unitaire: Num; pct_cout: NumGen;
  devise: Generated<string>;
  valide_du: Generated<Date>; valide_au: DateN;
  version_bareme: Generated<number>; motif: string | null;
  created_at: Generated<Date>; created_by: string | null;
}

export interface ParametresTable {
  sequence_serveur: Seq;
  cle: string; portee: Generated<'GLOBAL' | 'SITE'>; site_id: string | null;
  valeur: unknown; updated_at: Generated<Date>; updated_by: string | null;
}

export interface AuditLogsTable {
  id: Generated<number>;
  entite: string; entite_id: string | null; action: ActionAudit;
  ancienne_valeur: unknown | null; nouvelle_valeur: unknown | null;
  utilisateur_id: string | null; device_id: string | null;
  motif: string | null; adresse_ip: string | null;
  survenu_le: Generated<Date>;
}

export interface CreuseursTable {
  sequence_serveur: Seq;
  id: string; code: string; nom: string;
  postnom: string | null; prenom: string | null; sexe: 'H' | 'F' | null;
  telephone: string | null; numero_carte_artisanale: string | null;
  date_expiration_carte: DateN; equipe: string | null;
  site_id: string; statut: Generated<'ACTIF' | 'INACTIF'>; observation: string | null;
  created_at: Generated<Date>; updated_at: Generated<Date>;
  created_by: string | null; device_id: string | null;
  sync_status: Generated<StatutSync>; version: Generated<number>; deleted_at: DateN;
}

export interface CloturesJournalieresTable {
  sequence_serveur: Seq;
  id: string; numero: string; site_id: string; date_journee: Date_;
  responsable_id: string; cloture_le: Generated<Date>;
  statut: Generated<'CLOTUREE' | 'REOUVERTE'>;
  totaux: unknown; nb_operations: number;
  nb_non_synchronisees_a_la_cloture: Generated<number>;
  observations: string | null;
  reouverte_le: DateN; reouverte_par: string | null; motif_reouverture: string | null;
  created_at: Generated<Date>; updated_at: Generated<Date>;
  created_by: string | null; device_id: string | null;
  sync_status: Generated<StatutSync>; version: Generated<number>; deleted_at: DateN;
}

export interface OperationsTable {
  sequence_serveur: Seq;
  id: string; numero: string; site_id: string; date_operation: Date_; heure: string;
  responsable_id: string; creuseur_id: string; equipe: string | null;
  matiere_id: string; qty: Num; unite_id: string; teneur: Num;
  observation: string | null; signature_blob: Buffer | null;
  montant: NumN; devise: Generated<string>; calcul: unknown;
  statut: Generated<StatutOperationDb>; motif_annulation: string | null;
  cloture_id: string | null; verrouillee: Generated<boolean>;
  heure_appareil: Date_; heure_serveur: Generated<Date>; decalage_horloge_ms: number | null;
  created_at: Generated<Date>; updated_at: Generated<Date>;
  created_by: string; device_id: string;
  sync_status: Generated<StatutSync>; version: Generated<number>; deleted_at: DateN;
}

export interface IdempotencyKeysTable {
  cle: string; reponse: unknown; cree_le: Generated<Date>;
}

export interface LotsSynchronisationTable {
  id: string; device_id: string; utilisateur_id: string | null;
  nb_recus: number; nb_appliques: number; nb_ignores: number; nb_rejetes: number;
  recu_le: Generated<Date>;
}

export interface Database {
  lots_synchronisation: LotsSynchronisationTable;
  sites: SitesTable;
  unites: UnitesTable;
  utilisateurs: UtilisateursTable;
  devices: DevicesTable;
  matieres_premieres: MatieresPremieresTable;
  baremes_teneur: BaremesTeneurTable;
  parametres: ParametresTable;
  audit_logs: AuditLogsTable;
  creuseurs: CreuseursTable;
  clotures_journalieres: CloturesJournalieresTable;
  operations: OperationsTable;
  idempotency_keys: IdempotencyKeysTable;
}

export type Site = Selectable<SitesTable>;
export type Matiere = Selectable<MatieresPremieresTable>;
export type Bareme = Selectable<BaremesTeneurTable>;
export type Utilisateur = Selectable<UtilisateursTable>;
export type NouvelleMatiere = Insertable<MatieresPremieresTable>;
export type MajMatiere = Updateable<MatieresPremieresTable>;
