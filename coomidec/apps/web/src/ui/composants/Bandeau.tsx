import type { ContexteSaisie } from '../../db/operations.ts';

interface Props {
  contexte: ContexteSaisie;
  enLigne: boolean;
  enAttente: number;
  date: string;
  demonstration: boolean;
}

/**
 * Bandeau permanent. L'état réseau porte TOUJOURS un mot en plus de la
 * couleur : plein soleil et daltonisme sont deux raisons indépendantes de ne
 * jamais coder une information par la seule teinte.
 */
export function Bandeau({ contexte, enLigne, enAttente, date, demonstration }: Props) {
  const jour = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <header className="bandeau">
      <span className="site">{contexte.siteCode}</span>
      <span className="info">{jour}</span>
      <span className="info">Responsable : {contexte.responsableNom}</span>
      {demonstration && <span className="demo">DÉMONSTRATION</span>}
      <span className="pousse" />
      {enAttente > 0 && (
        <span className="compteur-attente" data-testid="compteur-attente">
          {enAttente} en attente
        </span>
      )}
      <span className={`etat ${enLigne ? 'en-ligne' : 'hors-ligne'}`} data-testid="etat-reseau">
        <span className="point" aria-hidden="true" />
        {enLigne ? 'EN LIGNE' : 'HORS LIGNE'}
      </span>
    </header>
  );
}
