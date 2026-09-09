import { useEffect, useMemo, useState } from 'react';
import type { BaremeLocal, CreuseurLocal, MatiereLocale, OperationLocale } from '../db/dexie.ts';
import { apercu, enregistrerOperation, SaisieRefusee, type ContexteSaisie } from '../db/operations.ts';
import { chercherCreuseurs, joursAvantExpiration } from '../db/referentiels.ts';
import { PaveNumerique } from './composants/PaveNumerique.tsx';
import { BandeauCalcul, fr } from './composants/BandeauCalcul.tsx';

interface Props {
  contexte: ContexteSaisie;
  matieres: MatiereLocale[];
  baremesParMatiere: Record<string, BaremeLocal[]>;
  onEnregistre: (op: OperationLocale) => void;
  onQuitter: () => void;
}

/**
 * Un seul écran, pas d'assistant multi-étapes. Quatre saisies : matière, QTY,
 * teneur, creuseur (obligatoire depuis la décision D8). Tout le reste est
 * prérempli. ENREGISTRER n'attend jamais le réseau.
 */
export function NouvelleSaisie({ contexte, matieres, baremesParMatiere, onEnregistre, onQuitter }: Props) {
  const [matiereId, setMatiereId] = useState(matieres[0]?.id ?? '');
  const [qty, setQty] = useState('');
  const [teneur, setTeneur] = useState('');
  const [terme, setTerme] = useState('');
  const [creuseurs, setCreuseurs] = useState<CreuseurLocal[]>([]);
  const [creuseur, setCreuseur] = useState<CreuseurLocal | null>(null);
  const [observation, setObservation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let vivant = true;
    void chercherCreuseurs(terme).then((r) => { if (vivant) setCreuseurs(r); });
    return () => { vivant = false; };
  }, [terme]);

  const matiere = matieres.find((m) => m.id === matiereId);
  const baremes = baremesParMatiere[matiereId] ?? [];

  const resultat = useMemo(
    () => (matiere ? apercu({ matiere, baremes, qty, teneur }) : null),
    [matiere, baremes, qty, teneur],
  );

  const complet = Boolean(matiere && creuseur && qty && teneur);
  const bloquant =
    resultat !== null &&
    (resultat.statut === 'ERREUR_FORMULE' || resultat.statut === 'TARIF_MANQUANT');

  async function enregistrer(puisNouvelle: boolean): Promise<void> {
    if (!matiere || !creuseur || enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      const op = await enregistrerOperation(contexte, {
        matiere, baremes, creuseur, qty, teneur,
        observation: observation || null,
      });
      onEnregistre(op);
      if (puisNouvelle) {
        setQty(''); setTeneur(''); setObservation('');
        // La matière et le creuseur restent : une équipe enchaîne souvent
        // plusieurs sacs du même creuseur sur la même matière.
      } else {
        onQuitter();
      }
    } catch (e) {
      setErreur(e instanceof SaisieRefusee ? e.message : 'Enregistrement impossible.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <main>
      <div className="titre-page">
        <h1>Nouvelle saisie</h1>
      </div>

      {erreur && <div className="erreur" role="alert">{erreur}</div>}

      <div className="carte">
        <div className="champ">
          <span className="etiquette">Matière première <span className="obl">*</span></span>
          <div className="choix">
            {matieres.map((m) => (
              <button
                key={m.id} type="button"
                aria-pressed={m.id === matiereId}
                onClick={() => setMatiereId(m.id)}
                data-testid={`matiere-${m.code}`}
              >
                {m.nom}<span className="u">{m.uniteCode}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="duo">
        <div className="champ">
          <span className="etiquette">
            Quantité <span className="obl">*</span>
            {matiere && <span style={{ fontWeight: 400, color: 'var(--muted)' }}> — en {matiere.uniteCode}</span>}
          </span>
          <PaveNumerique
            valeur={qty} onChange={setQty} decimales={3}
            libelle="Quantité" suffixe={matiere?.uniteCode} testId="qty"
          />
        </div>

        <div className="champ">
          <span className="etiquette">Teneur <span className="obl">*</span></span>
          <PaveNumerique
            valeur={teneur} onChange={setTeneur} decimales={3}
            libelle="Teneur en pourcentage" suffixe="%" testId="teneur"
          />
        </div>
        </div>

        <div className="champ">
          <span className="etiquette">Creuseur <span className="obl">*</span></span>
          <input
            className="recherche" type="search" inputMode="search"
            placeholder="Nom, prénom ou n° de carte…"
            value={terme} onChange={(e) => setTerme(e.target.value)}
            data-testid="recherche-creuseur"
          />
          <div className="liste-creuseurs">
            {creuseurs.map((c) => {
              const jours = joursAvantExpiration(c);
              return (
                <button
                  key={c.id} type="button"
                  aria-pressed={creuseur?.id === c.id}
                  onClick={() => setCreuseur(c)}
                  data-testid={`creuseur-${c.code}`}
                >
                  <span>
                    <span className="nom">{[c.nom, c.postnom, c.prenom].filter(Boolean).join(' ')}</span>
                    <br />
                    <span className="meta">{c.code} · {c.equipe ?? '—'}</span>
                  </span>
                  {jours !== null && jours < 30 && (
                    <span className={`puce ${jours < 0 ? 'err' : 'attente'}`}>
                      {jours < 0 ? 'CARTE EXPIRÉE' : `CARTE : ${jours} J`}
                    </span>
                  )}
                </button>
              );
            })}
            {creuseurs.length === 0 && <p className="vide">Aucun creuseur ne correspond.</p>}
          </div>
        </div>

        <div className="champ">
          <span className="etiquette">Observation</span>
          <input
            className="recherche" type="text" value={observation}
            onChange={(e) => setObservation(e.target.value)}
            placeholder="Facultatif" data-testid="observation"
          />
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        {resultat && <BandeauCalcul resultat={resultat} />}

        {creuseur && (
          <p style={{ color: 'var(--muted)', marginTop: -8, marginBottom: 16 }}>
            Creuseur : <b style={{ color: 'var(--ink)' }}>
              {[creuseur.nom, creuseur.postnom, creuseur.prenom].filter(Boolean).join(' ')}
            </b> ({creuseur.code})
            {qty && matiere && <> · {fr(qty)} {matiere.uniteCode}</>}
          </p>
        )}

        <div className="actions">
          <button
            type="button" className="btn-principal"
            disabled={!complet || bloquant || enCours}
            onClick={() => void enregistrer(false)}
            data-testid="enregistrer"
          >
            ENREGISTRER
          </button>
          <button
            type="button" className="btn-secondaire"
            disabled={!complet || bloquant || enCours}
            onClick={() => void enregistrer(true)}
            data-testid="enregistrer-et-nouvelle"
          >
            ENREGISTRER ET NOUVELLE SAISIE
          </button>
          <button type="button" className="btn-discret" onClick={onQuitter}>ANNULER</button>
        </div>
      </div>
    </main>
  );
}
