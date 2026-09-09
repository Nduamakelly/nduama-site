import { useCallback, useEffect, useState } from 'react';
import { db, type EntreeOutbox, type OperationLocale } from '../db/dexie.ts';
import { exporterFile, reessayer, synchroniser, transportHttp, type ResultatSync } from '../sync/moteur.ts';
import { fr } from './composants/BandeauCalcul.tsx';

interface Props {
  deviceId: string;
  enLigne: boolean;
  onChange: () => void;
  onQuitter: () => void;
}

interface Ligne {
  entree: EntreeOutbox;
  operation: OperationLocale | undefined;
}

export function Synchronisation({ deviceId, enLigne, onChange, onQuitter }: Props) {
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [recentes, setRecentes] = useState<OperationLocale[]>([]);
  const [resultat, setResultat] = useState<ResultatSync | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    const entrees = (await db.outbox.toArray()).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    const ops = await db.operations.where('id').anyOf(entrees.map((e) => e.entiteId)).toArray();
    const parId = new Map(ops.map((o) => [o.id, o]));
    setLignes(entrees.map((entree) => ({ entree, operation: parId.get(entree.entiteId) })));
    setRecentes(
      (await db.operations.where('syncStatus').equals('SYNCHRONISE').toArray())
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 20),
    );
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  async function lancer(): Promise<void> {
    setEnCours(true);
    try {
      const r = await synchroniser(transportHttp(() => localStorage.getItem('coomidec:jeton')), deviceId);
      setResultat(r);
      await charger();
      onChange();
    } finally {
      setEnCours(false);
    }
  }

  async function exporter(): Promise<void> {
    const contenu = await exporterFile();
    const url = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `coomidec-file-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const enAttente = lignes.filter((l) => l.entree.statut !== 'ERREUR');
  const enErreur = lignes.filter((l) => l.entree.statut === 'ERREUR');

  return (
    <main>
      <div className="titre-page">
        <h1>Synchronisation</h1>
        <button type="button" className="btn-discret" style={{ minHeight: 48, padding: '0 18px' }} onClick={onQuitter}>
          Retour
        </button>
      </div>

      {resultat && (
        <div
          className={resultat.rejetees > 0 ? 'erreur' : 'succes'}
          role="status"
          data-testid="resultat-sync"
        >
          {resultat.message}
        </div>
      )}

      <div className="actions" style={{ marginBottom: 22 }}>
        <button
          type="button" className="btn-principal"
          onClick={() => void lancer()}
          disabled={enCours || lignes.length === 0}
          data-testid="synchroniser-maintenant"
        >
          {enCours ? 'SYNCHRONISATION…' : 'SYNCHRONISER MAINTENANT'}
        </button>
        <button type="button" className="btn-discret" onClick={() => void exporter()} disabled={lignes.length === 0}>
          EXPORTER LA FILE
        </button>
      </div>

      {!enLigne && lignes.length > 0 && (
        <p style={{ color: 'var(--ambre)', fontWeight: 600, marginBottom: 18 }}>
          Hors ligne — la file partira automatiquement au retour du réseau.
        </p>
      )}

      <Section
        titre="EN ATTENTE" lignes={enAttente} vide="Rien en attente."
        testId="liste-attente"
      />
      <Section
        titre="EN ERREUR" lignes={enErreur} vide="Aucune erreur."
        testId="liste-erreur"
        onReessayer={async (seq) => { await reessayer(seq); await charger(); }}
      />

      <h2 style={{ fontSize: 18, marginTop: 28, marginBottom: 12 }}>
        SYNCHRONISÉES <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(20 dernières)</span>
      </h2>
      <div className="tableau">
        <table>
          <thead>
            <tr><th>N°</th><th>Matière</th><th style={{ textAlign: 'right' }}>Valeur</th><th>État</th></tr>
          </thead>
          <tbody>
            {recentes.map((o) => (
              <tr key={o.id}>
                <td style={{ fontSize: 13 }}>{o.numero.split('/').pop()}</td>
                <td>{o.matiereNom}</td>
                <td className="n">{o.montant ? `${fr(o.montant, 2)} ${o.devise}` : '—'}</td>
                <td><span className="puce ok">SYNCHRONISÉ</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {recentes.length === 0 && <p className="vide">Aucune opération synchronisée pour l instant.</p>}
      </div>
    </main>
  );
}

function Section({
  titre, lignes, vide, testId, onReessayer,
}: {
  titre: string;
  lignes: Ligne[];
  vide: string;
  testId: string;
  onReessayer?: (seq: number) => Promise<void>;
}) {
  return (
    <>
      <h2 style={{ fontSize: 18, marginTop: 8, marginBottom: 12 }}>
        {titre} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({lignes.length})</span>
      </h2>
      <div className="tableau" style={{ marginBottom: 20 }}>
        <table>
          <thead>
            <tr>
              <th>N°</th><th>Enregistrée</th><th style={{ textAlign: 'right' }}>Valeur</th>
              <th style={{ textAlign: 'right' }}>Tentatives</th><th>Message</th>
              {onReessayer && <th />}
            </tr>
          </thead>
          <tbody data-testid={testId}>
            {lignes.map(({ entree, operation }) => (
              <tr key={entree.seq}>
                <td style={{ fontSize: 13 }}>{operation?.numero.split('/').pop() ?? '—'}</td>
                <td>{new Date(entree.creeLe).toLocaleString('fr-FR')}</td>
                <td className="n">
                  {operation?.montant ? `${fr(operation.montant, 2)} ${operation.devise}` : '—'}
                </td>
                <td className="n">{entree.tentatives}</td>
                <td style={{ color: 'var(--muted)', fontSize: 14 }}>
                  {entree.derniereErreur ?? 'En attente de synchronisation'}
                </td>
                {onReessayer && (
                  <td>
                    <button
                      type="button" className="btn-discret"
                      style={{ minHeight: 44, padding: '0 14px', fontSize: 14 }}
                      onClick={() => void onReessayer(entree.seq!)}
                    >
                      Réessayer
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {lignes.length === 0 && <p className="vide">{vide}</p>}
      </div>
    </>
  );
}
