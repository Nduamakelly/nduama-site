interface Props {
  nbOperations: number;
  nbEnAttente: number;
  onNaviguer: (vue: 'saisie' | 'jour' | 'sync') => void;
}

/** Huit tuiles, la saisie dominante : c'est 95 % de l'usage sur le terrain. */
export function Accueil({ nbOperations, nbEnAttente, onNaviguer }: Props) {
  const aVenir = (nom: string) => () =>
    window.alert(`${nom} — module à venir (M5 à M9).`);

  return (
    <main>
      <div className="tuiles">
        <button type="button" className="tuile principale" onClick={() => onNaviguer('saisie')} data-testid="tuile-saisie">
          <span className="t">NOUVELLE SAISIE</span>
          <span className="s">Enregistrer une opération — fonctionne hors ligne</span>
        </button>

        <button type="button" className="tuile" onClick={() => onNaviguer('jour')} data-testid="tuile-jour">
          <span className="t">OPÉRATIONS DU JOUR</span>
          <span className="s">{nbOperations} enregistrée{nbOperations > 1 ? 's' : ''}</span>
        </button>

        <button type="button" className="tuile" onClick={() => onNaviguer('sync')} data-testid="tuile-sync">
          <span className="t">SYNCHRONISATION</span>
          <span className="s">{nbEnAttente > 0 ? `${nbEnAttente} en attente` : 'Rien en attente'}</span>
        </button>

        {[
          ['CLÔTURE JOURNALIÈRE', 'Verrouiller la journée'],
          ['RAPPORT', 'Rapport A4 et PDF'],
          ['TABLEAU DE BORD', 'Indicateurs et graphiques'],
          ['CREUSEURS', 'Registre et cartes artisanales'],
          ['PARAMÈTRES', 'Matières, barèmes, formules'],
        ].map(([titre, sous]) => (
          <button key={titre} type="button" className="tuile" onClick={aVenir(titre!)}>
            <span className="t">{titre}</span>
            <span className="s">{sous}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
