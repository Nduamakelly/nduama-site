/**
 * Enregistrement d'une opération.
 *
 * Règle absolue : l'écriture ne passe JAMAIS par le réseau. L'interface écrit
 * dans IndexedDB, puis rend la main. La synchronisation est un processus
 * d'arrière-plan qui n'a pas le droit de faire échouer une saisie.
 */
import { calculerOperation, type BaremeTranche, type MatiereCalcul } from '@coomidec/core';
import {
  db,
  type BaremeLocal,
  type CreuseurLocal,
  type MatiereLocale,
  type OperationLocale,
} from './dexie.ts';
import { composerNumero, heureLocale, journeeMetier } from './numero.ts';

export interface ContexteSaisie {
  siteId: string;
  siteCode: string;
  responsableId: string;
  responsableNom: string;
  deviceId: string;
  fuseau?: string;
}

export interface SaisieAgent {
  matiere: MatiereLocale;
  baremes: BaremeLocal[];
  creuseur: CreuseurLocal;
  qty: string;
  teneur: string;
  observation?: string | null;
  signature?: string | null;
  equipe?: string | null;
}

export function versMatiereCalcul(m: MatiereLocale): MatiereCalcul {
  return {
    id: m.id, code: m.code, nom: m.nom, methode: m.methode,
    prixParPourcent: m.prixParPourcent, pctCoutDefaut: m.pctCoutDefaut,
    formule: m.formule, devise: m.devise, uniteCode: m.uniteCode,
    decimalesMontant: m.decimalesMontant,
  };
}

export function versBaremesCalcul(bs: BaremeLocal[]): BaremeTranche[] {
  return bs.map((b) => ({
    id: b.id, matiereId: b.matiereId,
    teneurMin: b.teneurMin, teneurMax: b.teneurMax,
    coutUnitaire: b.coutUnitaire, pctCout: b.pctCout,
    devise: b.devise, valideDu: b.valideDu, valideAu: b.valideAu,
    versionBareme: b.versionBareme,
  }));
}

/** Aperçu temps réel sous le formulaire — même moteur que l'enregistrement. */
export function apercu(saisie: Omit<SaisieAgent, 'creuseur'>, maintenant = new Date()) {
  return calculerOperation({
    qty: saisie.qty,
    teneur: saisie.teneur,
    matiere: versMatiereCalcul(saisie.matiere),
    baremes: versBaremesCalcul(saisie.baremes),
    calculeA: maintenant.toISOString(),
  });
}

export class SaisieRefusee extends Error {}

/**
 * Écrit l'opération ET son entrée d'outbox dans une SEULE transaction.
 *
 * Les deux réussissent ou échouent ensemble. C'est ce qui garantit le TEST 1 :
 * coupure d'alimentation, fermeture forcée, redémarrage de la tablette — les
 * opérations sont là, et elles sont toujours en file. La confirmation n'est
 * affichée qu'après le retour de cette fonction.
 */
export async function enregistrerOperation(
  ctx: ContexteSaisie,
  saisie: SaisieAgent,
  maintenant = new Date(),
): Promise<OperationLocale> {
  const fuseau = ctx.fuseau ?? 'Africa/Lubumbashi';
  const dateOperation = journeeMetier(maintenant, fuseau);

  const resultat = apercu(saisie, maintenant);
  if (resultat.statut === 'INCOMPLET' || resultat.statut === 'TARIF_MANQUANT') {
    throw new SaisieRefusee(
      resultat.avertissements[0] ?? 'Renseignez la quantité et la teneur.',
    );
  }
  if (resultat.statut === 'ERREUR_FORMULE') {
    throw new SaisieRefusee(resultat.avertissements[0] ?? 'Formule de calcul invalide.');
  }

  // Une teneur hors barème n'invente pas un montant nul : l'opération part
  // en A_VALIDER et bloquera la clôture tant qu'elle n'est pas traitée.
  const horsBareme = resultat.statut === 'HORS_BAREME';
  const iso = maintenant.toISOString();

  return db.transaction('rw', db.operations, db.outbox, db.meta, async () => {
    // La séquence est allouée DANS la transaction : deux saisies rapides ne
    // peuvent pas se voir attribuer le même numéro.
    const cleSequence = `sequence:${ctx.siteId}:${dateOperation}`;
    const enregistrement = await db.meta.get(cleSequence);
    const sequence = ((enregistrement?.valeur as number | undefined) ?? 0) + 1;
    await db.meta.put({ cle: cleSequence, valeur: sequence });

    const operation: OperationLocale = {
      id: crypto.randomUUID(),
      numero: composerNumero(ctx.siteCode, dateOperation, ctx.deviceId, sequence),
      siteId: ctx.siteId,
      siteCode: ctx.siteCode,
      dateOperation,
      heure: heureLocale(maintenant, fuseau),
      responsableId: ctx.responsableId,
      responsableNom: ctx.responsableNom,
      creuseurId: saisie.creuseur.id,
      creuseurNom: [saisie.creuseur.nom, saisie.creuseur.postnom, saisie.creuseur.prenom]
        .filter(Boolean).join(' '),
      equipe: saisie.equipe ?? saisie.creuseur.equipe,
      matiereId: saisie.matiere.id,
      matiereNom: saisie.matiere.nom,
      qty: saisie.qty,
      uniteId: saisie.matiere.uniteId,
      uniteCode: saisie.matiere.uniteCode,
      teneur: saisie.teneur,
      observation: saisie.observation?.trim() || null,
      signature: saisie.signature ?? null,
      montant: resultat.montant,
      devise: resultat.devise,
      calcul: resultat.snapshot,
      statut: horsBareme ? 'A_VALIDER' : 'VALIDEE',
      motifAnnulation: null,
      verrouillee: false,
      clotureId: null,
      heureAppareil: iso,
      deviceId: ctx.deviceId,
      version: 1,
      syncStatus: 'EN_ATTENTE',
      createdAt: iso,
      updatedAt: iso,
    };

    await db.operations.add(operation);
    await db.outbox.add({
      entite: 'operation',
      entiteId: operation.id,
      version: operation.version,
      statut: 'EN_ATTENTE',
      tentatives: 0,
      prochainEssaiLe: maintenant.getTime(),
      derniereErreur: null,
      creeLe: maintenant.getTime(),
    });

    return operation;
  });
}

/** Annulation : motif obligatoire, jamais de suppression. */
export async function annulerOperation(
  id: string,
  motif: string,
  maintenant = new Date(),
): Promise<void> {
  const m = motif.trim();
  if (!m) throw new SaisieRefusee('Un motif d annulation est obligatoire.');

  await db.transaction('rw', db.operations, db.outbox, async () => {
    const op = await db.operations.get(id);
    if (!op) throw new SaisieRefusee('Opération introuvable.');
    if (op.verrouillee) {
      throw new SaisieRefusee(
        `Opération ${op.numero} clôturée : une modification exige la procédure de correction contrôlée.`,
      );
    }
    const version = op.version + 1;
    await db.operations.update(id, {
      statut: 'ANNULEE',
      motifAnnulation: m,
      version,
      syncStatus: 'EN_ATTENTE',
      updatedAt: maintenant.toISOString(),
    });
    await db.outbox.add({
      entite: 'operation', entiteId: id, version,
      statut: 'EN_ATTENTE', tentatives: 0,
      prochainEssaiLe: maintenant.getTime(), derniereErreur: null,
      creeLe: maintenant.getTime(),
    });
  });
}

export async function operationsDuJour(siteId: string, date: string): Promise<OperationLocale[]> {
  const ops = await db.operations.where('[siteId+dateOperation]').equals([siteId, date]).toArray();
  return ops.sort((a, b) => a.numero.localeCompare(b.numero));
}

export function compterEnAttente(): Promise<number> {
  return db.outbox.where('statut').anyOf('EN_ATTENTE', 'EN_COURS', 'ERREUR').count();
}
