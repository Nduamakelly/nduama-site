import type { ResultatCalcul } from '@coomidec/core';

/** Formate un décimal en français : 5600.00 → « 5 600,00 ». */
export function fr(v: string | null, decimales?: number): string {
  if (v === null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: decimales ?? (v.includes('.') ? v.split('.')[1]!.length : 0),
    maximumFractionDigits: decimales ?? 6,
  });
}

const LIBELLES: Record<string, string> = {
  CALCULE: 'Valeur',
  HORS_BAREME: 'Hors barème',
  INCOMPLET: 'Renseignez la quantité et la teneur',
  TARIF_MANQUANT: 'Tarif non paramétré',
  ERREUR_FORMULE: 'Formule invalide',
};

/**
 * Bandeau de calcul en direct, sous les champs. Il montre le tarif appliqué
 * autant que le résultat : l'agent doit pouvoir vérifier d'où vient le montant.
 */
export function BandeauCalcul({ resultat }: { resultat: ResultatCalcul }) {
  const t = resultat.snapshot.tarif;
  const calcule = resultat.statut === 'CALCULE';

  return (
    <div className="calcul" data-statut={resultat.statut} data-testid="bandeau-calcul">
      <div className="detail">
        {t.prixParPourcent !== null && (
          <span>Prix par 1 % <b>{fr(t.prixParPourcent, 2)} {t.devise}</b></span>
        )}
        {resultat.snapshot.intermediaires.valeurTeneur !== undefined && (
          <span>Valeur de teneur <b>{fr(resultat.snapshot.intermediaires.valeurTeneur, 2)} {t.devise}</b></span>
        )}
        {t.trancheMin !== null && (
          <span>Barème <b>{fr(t.trancheMin)} – {fr(t.trancheMax)} %</b></span>
        )}
        {t.coutUnitaire !== null && (
          <span>Coût/unité <b>{fr(t.coutUnitaire, 2)} {t.devise}</b></span>
        )}
        {t.pctCout !== '1' && <span>% coût <b>{fr(String(Number(t.pctCout) * 100))} %</b></span>}
        {!calcule && resultat.avertissements[0] && <span>{resultat.avertissements[0]}</span>}
      </div>
      <div className="total">
        <span className="l">{LIBELLES[resultat.statut] ?? resultat.statut}</span>
        <span className="v" data-testid="montant">
          {calcule ? `${fr(resultat.montant, 2)} ${resultat.devise}` : '—'}
        </span>
      </div>
    </div>
  );
}
