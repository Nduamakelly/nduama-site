import { useState } from 'react';
import { agregerJournee, type OperationAgregable } from '@coomidec/core';
import type { OperationLocale } from '../db/dexie.ts';
import { annulerOperation } from '../db/operations.ts';
import { fr } from './composants/BandeauCalcul.tsx';

interface Props {
  operations: OperationLocale[];
  onChange: () => void;
  onQuitter: () => void;
}

const PUCE_SYNC: Record<string, { c: string; t: string }> = {
  SYNCHRONISE: { c: 'ok', t: 'SYNCHRONISÉ' },
  EN_ATTENTE: { c: 'attente', t: 'EN ATTENTE' },
  EN_COURS: { c: 'attente', t: 'EN COURS' },
  ERREUR: { c: 'err', t: 'ERREUR' },
  CONFLIT: { c: 'err', t: 'CONFLIT' },
};

export function OperationsDuJour({ operations, onChange, onQuitter }: Props) {
  const [filtre, setFiltre] = useState('');

  const visibles = operations.filter((o) => {
    if (!filtre.trim()) return true;
    const t = filtre.toLowerCase();
    return [o.numero, o.matiereNom, o.creuseurNom, o.responsableNom]
      .some((v) => v.toLowerCase().includes(t));
  });

  // Totaux calculés par le moteur partagé : la teneur moyenne pondérée et la
  // moyenne arithmétique sont affichées côte à côte (décision D1).
  const totaux = agregerJournee(
    operations.map<OperationAgregable>((o) => ({
      id: o.id, matiereId: o.matiereId, matiereNom: o.matiereNom,
      uniteCode: o.uniteCode, qty: o.qty, teneur: o.teneur,
      montant: o.montant, devise: o.devise,
      statut: o.statut === 'A_VALIDER' ? 'VALIDEE' : o.statut,
      syncStatus: o.syncStatus === 'SYNCHRONISE' ? 'SYNCHRONISE' : 'EN_ATTENTE',
    })),
  );

  async function annuler(op: OperationLocale): Promise<void> {
    const motif = window.prompt(`Motif d'annulation de ${op.numero} :`);
    if (motif === null) return;
    try {
      await annulerOperation(op.id, motif);
      onChange();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Annulation impossible.');
    }
  }

  return (
    <main>
      <div className="titre-page">
        <h1>Opérations du jour</h1>
        <button type="button" className="btn-discret" style={{ minHeight: 48, padding: '0 18px' }} onClick={onQuitter}>
          Retour
        </button>
      </div>

      <input
        className="recherche" type="search" value={filtre}
        onChange={(e) => setFiltre(e.target.value)}
        placeholder="Rechercher un numéro, une matière, un creuseur…"
        style={{ marginBottom: 16 }} data-testid="filtre-operations"
      />

      <div className="tableau">
        <table>
          <thead>
            <tr>
              <th>N°</th><th>Heure</th><th>Matière</th><th>Creuseur</th>
              <th style={{ textAlign: 'right' }}>QTY</th>
              <th style={{ textAlign: 'right' }}>Teneur</th>
              <th style={{ textAlign: 'right' }}>Valeur</th>
              <th>Sync</th><th>Statut</th><th />
            </tr>
          </thead>
          <tbody data-testid="lignes-operations">
            {visibles.map((o) => {
              const p = PUCE_SYNC[o.syncStatus] ?? { c: 'neutre', t: o.syncStatus };
              return (
                <tr key={o.id} data-annulee={o.statut === 'ANNULEE'} data-testid="ligne-operation">
                  <td style={{ fontSize: 13 }}>{o.numero.split('/').pop()}</td>
                  <td>{o.heure.slice(0, 5)}</td>
                  <td>{o.matiereNom}</td>
                  <td>{o.creuseurNom}</td>
                  <td className="n">{fr(o.qty)} {o.uniteCode}</td>
                  <td className="n">{fr(o.teneur)} %</td>
                  <td className="n">{o.montant ? `${fr(o.montant, 2)} ${o.devise}` : '—'}</td>
                  <td><span className={`puce ${p.c}`}>{p.t}</span></td>
                  <td>
                    <span className={`puce ${o.statut === 'ANNULEE' ? 'err' : o.statut === 'A_VALIDER' ? 'attente' : 'neutre'}`}>
                      {o.statut === 'A_VALIDER' ? 'HORS BARÈME' : o.statut}
                    </span>
                  </td>
                  <td>
                    {o.statut !== 'ANNULEE' && !o.verrouillee && (
                      <button
                        type="button" className="btn-discret"
                        style={{ minHeight: 44, padding: '0 14px', fontSize: 14 }}
                        onClick={() => void annuler(o)}
                        data-testid={`annuler-${o.numero.split('/').pop()}`}
                      >
                        Annuler
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibles.length === 0 && <p className="vide">Aucune opération pour cette journée.</p>}

        <div className="totaux">
          <span>Opérations <b data-testid="total-operations">{totaux.nbOperations}</b></span>
          {totaux.nbAnnulees > 0 && <span>Annulées <b>{totaux.nbAnnulees}</b></span>}
          <span>QTY totale <b>{fr(totaux.qtyTotale)}</b></span>
          <span>Teneur moyenne pondérée <b>{fr(totaux.teneurMoyennePonderee)} %</b></span>
          <span style={{ color: 'var(--muted)' }}>
            arithmétique <b>{fr(totaux.teneurMoyenneArithmetique)} %</b>
          </span>
          <span>Valeur totale <b>{fr(totaux.montantTotal, 2)} {totaux.devise ?? ''}</b></span>
          {totaux.nbNonSynchronisees > 0 && (
            <span style={{ color: 'var(--ambre)' }}>
              Non synchronisées <b>{totaux.nbNonSynchronisees}</b>
            </span>
          )}
        </div>
      </div>
    </main>
  );
}
