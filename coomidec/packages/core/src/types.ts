/**
 * Types du domaine de calcul COOMIDEC.
 *
 * Les grandeurs décimales circulent en `string` (ou `number` en entrée, converti
 * immédiatement) : jamais de flottant IEEE-754 conservé pour de l'argent.
 */

/** Version du moteur, figée dans chaque snapshot d'opération. */
export const MOTEUR_VERSION = '1.0.0';

export type MethodeCalcul = 'PRIX_PAR_POURCENT' | 'BAREME_TRANCHES';

export type StatutCalcul =
  | 'CALCULE'        // montant produit
  | 'HORS_BAREME'    // aucune tranche ne couvre la teneur saisie
  | 'INCOMPLET'      // QTY ou teneur manquante
  | 'TARIF_MANQUANT' // matière mal paramétrée (prix par 1 % absent)
  | 'ERREUR_FORMULE';

/** Valeur décimale acceptée en entrée. */
export type Numerique = number | string;

/**
 * Une tranche de barème. Historisée : jamais modifiée en place.
 * Bornes semi-ouvertes `[teneurMin, teneurMax)` — voir docs/06 Q2.
 */
export interface BaremeTranche {
  id: string;
  matiereId: string;
  teneurMin: Numerique;
  teneurMax: Numerique;
  /** Coût / valeur par unité pour cette tranche (colonne G du classeur). */
  coutUnitaire: Numerique;
  /** Facteur multiplicateur de la tranche (colonne H du classeur). */
  pctCout: Numerique;
  devise: string;
  valideDu: string;
  /** `null` ⇒ tranche active. */
  valideAu: string | null;
  versionBareme: number;
}

export interface MatiereCalcul {
  id: string;
  code: string;
  nom: string;
  methode: MethodeCalcul;
  /** Méthode A : valeur d'un point de teneur, ex. cuivre 1 % = 140 USD. */
  prixParPourcent?: Numerique | null;
  /** Facteur appliqué par défaut quand aucune tranche ne le fournit. Défaut : 1. */
  pctCoutDefaut?: Numerique | null;
  /** Expression configurable ; vide ⇒ formule par défaut de la méthode. */
  formule?: string | null;
  devise: string;
  uniteCode: string;
  /** Décimales du montant final. Défaut : 2. */
  decimalesMontant?: number | null;
}

export interface EntreeCalcul {
  qty: Numerique | null | undefined;
  /** Teneur en pourcentage : `3.2` pour 3,2 %. */
  teneur: Numerique | null | undefined;
  matiere: MatiereCalcul;
  /** Tranches connues pour cette matière (actives et historiques). */
  baremes?: BaremeTranche[];
  /** Horodatage du calcul, injecté par l'appelant (fonction pure). */
  calculeA: string;
}

/** Tarif effectivement retenu — c'est lui qui est figé dans l'opération. */
export interface TarifApplique {
  coutUnitaire: string | null;
  pctCout: string;
  prixParPourcent: string | null;
  devise: string;
  baremeId: string | null;
  baremeVersion: number | null;
  trancheMin: string | null;
  trancheMax: string | null;
}

/**
 * Snapshot autoportant : tout ce qu'il faut pour réexpliquer un montant
 * dix ans plus tard sans relire aucune autre table.
 */
export interface SnapshotCalcul {
  moteurVersion: string;
  methode: MethodeCalcul;
  formule: string;
  entrees: { qty: string; teneur: string; unite: string };
  tarif: TarifApplique;
  intermediaires: Record<string, string>;
  montantBrut: string | null;
  montantArrondi: string | null;
  decimales: number;
  calculeA: string;
}

export interface ResultatCalcul {
  statut: StatutCalcul;
  /** Montant arrondi, prêt à être stocké. `null` si non calculable. */
  montant: string | null;
  devise: string;
  snapshot: SnapshotCalcul;
  avertissements: string[];
}

/** Formules par défaut. Toutes deux surchargeables par matière, sans toucher au code. */
export const FORMULE_DEFAUT: Record<MethodeCalcul, string> = {
  // Transposition exacte de SAISIE JOURNALIERE!G9 du classeur.
  BAREME_TRANCHES: 'QTY * COUT_UNITAIRE * PCT_COUT',
  // Décision D4 : cuivre 1 % = 140 USD ⇒ valeur du point de teneur × quantité.
  PRIX_PAR_POURCENT: 'QTY * VALEUR_TENEUR * PCT_COUT',
};
