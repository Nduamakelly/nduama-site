/**
 * Moteur de calcul centralisé — point d'entrée unique.
 *
 * Fonction pure : aucun I/O, aucun accès base, pas même `Date.now()`
 * (l'horodatage est fourni par l'appelant). Le même code s'exécute sur la
 * tablette hors ligne et sur le serveur à la synchronisation.
 */
import { Decimal, dec, decOuNull, txt, txtFixe, arrondiCommercial } from './decimal.js';
import { compilerFormule, ErreurFormule, type Portee } from './formule.js';
import { resoudreTranche } from './bareme.js';
import {
  FORMULE_DEFAUT,
  MOTEUR_VERSION,
  type EntreeCalcul,
  type ResultatCalcul,
  type SnapshotCalcul,
  type StatutCalcul,
  type TarifApplique,
} from './types.js';

const UN = new Decimal(1);

function snapshotVide(
  e: EntreeCalcul,
  formule: string,
  tarif: TarifApplique,
  qty: Decimal | null,
  teneur: Decimal | null,
  decimales: number,
): SnapshotCalcul {
  return {
    moteurVersion: MOTEUR_VERSION,
    methode: e.matiere.methode,
    formule,
    entrees: {
      qty: txt(qty) ?? '',
      teneur: txt(teneur) ?? '',
      unite: e.matiere.uniteCode,
    },
    tarif,
    intermediaires: {},
    montantBrut: null,
    montantArrondi: null,
    decimales,
    calculeA: e.calculeA,
  };
}

/**
 * Calcule le montant d'une opération et produit le snapshot à figer.
 *
 * Le snapshot est autoportant : une modification ultérieure du barème ne peut
 * plus l'atteindre. C'est le mécanisme du TEST 3.
 */
export function calculerOperation(e: EntreeCalcul): ResultatCalcul {
  const { matiere } = e;
  const devise = matiere.devise;
  const decimales = matiere.decimalesMontant ?? 2;
  const formule = matiere.formule?.trim() || FORMULE_DEFAUT[matiere.methode];
  const avertissements: string[] = [];

  const qty = decOuNull(e.qty);
  const teneur = decOuNull(e.teneur);

  let tarif: TarifApplique = {
    coutUnitaire: null,
    pctCout: '1',
    prixParPourcent: null,
    devise,
    baremeId: null,
    baremeVersion: null,
    trancheMin: null,
    trancheMax: null,
  };

  const echec = (statut: StatutCalcul, message?: string): ResultatCalcul => {
    if (message) avertissements.push(message);
    return {
      statut,
      montant: null,
      devise,
      snapshot: snapshotVide(e, formule, tarif, qty, teneur, decimales),
      avertissements,
    };
  };

  if (qty === null || teneur === null) {
    return echec('INCOMPLET');
  }
  if (qty.isNegative()) return echec('INCOMPLET', 'La quantité ne peut pas être négative.');
  if (teneur.isNegative()) return echec('INCOMPLET', 'La teneur ne peut pas être négative.');
  if (teneur.greaterThan(100)) {
    avertissements.push(`Teneur de ${teneur.toFixed()} % : valeur inhabituelle, à vérifier.`);
  }

  // --- Résolution du tarif ------------------------------------------------
  let pctCout = decOuNull(matiere.pctCoutDefaut ?? null) ?? UN;
  let coutUnitaire: Decimal | null = null;
  let prixParPourcent: Decimal | null = decOuNull(matiere.prixParPourcent ?? null);

  if (matiere.methode === 'BAREME_TRANCHES') {
    let tranche;
    try {
      tranche = resoudreTranche(e.baremes ?? [], matiere.id, teneur);
    } catch (err) {
      return echec('ERREUR_FORMULE', err instanceof Error ? err.message : String(err));
    }
    if (tranche === null) {
      return echec(
        'HORS_BAREME',
        `Aucune tranche du barème ne couvre une teneur de ${teneur.toFixed()} % pour ${matiere.nom}.`,
      );
    }
    coutUnitaire = dec(tranche.coutUnitaire);
    pctCout = dec(tranche.pctCout);
    tarif = {
      coutUnitaire: txt(coutUnitaire),
      pctCout: txt(pctCout)!,
      prixParPourcent: txt(prixParPourcent),
      devise: tranche.devise || devise,
      baremeId: tranche.id,
      baremeVersion: tranche.versionBareme,
      trancheMin: txt(dec(tranche.teneurMin)),
      trancheMax: txt(dec(tranche.teneurMax)),
    };
  } else {
    if (prixParPourcent === null) {
      return echec(
        'TARIF_MANQUANT',
        `Aucun prix par 1 % de teneur n'est paramétré pour ${matiere.nom}.`,
      );
    }
    tarif = { ...tarif, prixParPourcent: txt(prixParPourcent), pctCout: txt(pctCout)! };
  }

  // --- Variables offertes à la formule ------------------------------------
  const valeurTeneur = prixParPourcent !== null ? teneur.times(prixParPourcent) : null;

  const portee: Portee = { QTY: qty, TENEUR: teneur, PCT_COUT: pctCout };
  if (coutUnitaire !== null) portee.COUT_UNITAIRE = coutUnitaire;
  if (prixParPourcent !== null) portee.PRIX_PAR_POURCENT = prixParPourcent;
  if (valeurTeneur !== null) portee.VALEUR_TENEUR = valeurTeneur;

  const intermediaires: Record<string, string> = {};
  if (valeurTeneur !== null) intermediaires.valeurTeneur = txt(valeurTeneur)!;

  // --- Évaluation ---------------------------------------------------------
  let brut: Decimal;
  try {
    brut = compilerFormule(formule)(portee);
  } catch (err) {
    const message =
      err instanceof ErreurFormule
        ? `Formule « ${formule} » : ${err.message}`
        : String(err);
    const r = echec('ERREUR_FORMULE', message);
    r.snapshot.intermediaires = intermediaires;
    return r;
  }

  const montant = arrondiCommercial(brut, decimales);

  return {
    statut: 'CALCULE',
    montant: txtFixe(montant, decimales),
    devise: tarif.devise,
    snapshot: {
      moteurVersion: MOTEUR_VERSION,
      methode: matiere.methode,
      formule,
      entrees: { qty: txt(qty)!, teneur: txt(teneur)!, unite: matiere.uniteCode },
      tarif,
      intermediaires,
      montantBrut: txt(brut),
      montantArrondi: txtFixe(montant, decimales),
      decimales,
      calculeA: e.calculeA,
    },
    avertissements,
  };
}

/**
 * Revérifie une opération reçue par l'API à partir de SON PROPRE snapshot.
 * Le serveur ne relit jamais le barème courant : il rejoue le tarif transporté.
 */
export function verifierSnapshot(snapshot: SnapshotCalcul): {
  conforme: boolean;
  montantAttendu: string | null;
  motif?: string;
} {
  try {
    const portee: Portee = {
      QTY: dec(snapshot.entrees.qty),
      TENEUR: dec(snapshot.entrees.teneur),
      PCT_COUT: dec(snapshot.tarif.pctCout),
    };
    if (snapshot.tarif.coutUnitaire !== null) portee.COUT_UNITAIRE = dec(snapshot.tarif.coutUnitaire);
    if (snapshot.tarif.prixParPourcent !== null) {
      portee.PRIX_PAR_POURCENT = dec(snapshot.tarif.prixParPourcent);
      portee.VALEUR_TENEUR = dec(snapshot.entrees.teneur).times(dec(snapshot.tarif.prixParPourcent));
    }
    const brut = compilerFormule(snapshot.formule)(portee);
    const attendu = txtFixe(arrondiCommercial(brut, snapshot.decimales), snapshot.decimales);
    return {
      conforme: attendu === snapshot.montantArrondi,
      montantAttendu: attendu,
      ...(attendu === snapshot.montantArrondi
        ? {}
        : { motif: `Montant recalculé ${attendu}, montant transporté ${snapshot.montantArrondi}.` }),
    };
  } catch (err) {
    return {
      conforme: false,
      montantAttendu: null,
      motif: err instanceof Error ? err.message : String(err),
    };
  }
}
