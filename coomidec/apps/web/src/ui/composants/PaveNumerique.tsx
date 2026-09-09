/**
 * Pavé numérique intégré : pas de clavier alphabétique pour saisir un nombre,
 * et de grosses touches utilisables avec des gants.
 */
interface Props {
  valeur: string;
  onChange: (v: string) => void;
  decimales?: number;
  libelle: string;
  suffixe?: string;
  testId?: string;
}

export function PaveNumerique({ valeur, onChange, decimales = 3, libelle, suffixe, testId }: Props) {
  function appuyer(touche: string): void {
    if (touche === 'C') return onChange('');
    if (touche === '←') return onChange(valeur.slice(0, -1));
    if (touche === ',') {
      if (valeur.includes('.')) return;
      return onChange((valeur === '' ? '0' : valeur) + '.');
    }
    const [, apres] = valeur.split('.');
    if (apres !== undefined && apres.length >= decimales) return;
    if (valeur === '0' && touche !== '.') return onChange(touche);
    onChange(valeur + touche);
  }

  return (
    <div>
      <div
        className="valeur-saisie"
        data-vide={valeur === ''}
        data-testid={testId}
        role="status"
        aria-label={libelle}
      >
        {valeur === '' ? '0' : valeur.replace('.', ',')}
        {suffixe ? ` ${suffixe}` : ''}
      </div>
      <div className="pave">
        {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((t) => (
          <button key={t} type="button" onClick={() => appuyer(t)} data-testid={`${testId}-${t}`}>
            {t}
          </button>
        ))}
        <button type="button" className="action" onClick={() => appuyer(',')} data-testid={`${testId}-virgule`}>,</button>
        <button type="button" onClick={() => appuyer('0')} data-testid={`${testId}-0`}>0</button>
        <button type="button" className="action" onClick={() => appuyer('←')} aria-label="Effacer un chiffre" data-testid={`${testId}-effacer`}>←</button>
      </div>
    </div>
  );
}
