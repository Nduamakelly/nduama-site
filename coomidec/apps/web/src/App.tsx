import { useCallback, useEffect, useState } from 'react';
import type { BaremeLocal, MatiereLocale, OperationLocale } from './db/dexie.ts';
import { db } from './db/dexie.ts';
import { ecrireContexte, identifiantAppareil, lireContexte } from './db/appareil.ts';
import { compterEnAttente, operationsDuJour, type ContexteSaisie } from './db/operations.ts';
import { journeeMetier } from './db/numero.ts';
import { amorcerDemonstration, matieresActives } from './db/referentiels.ts';
import demo from './db/demo.json';
import { Bandeau } from './ui/composants/Bandeau.tsx';
import { Accueil } from './ui/Accueil.tsx';
import { NouvelleSaisie } from './ui/NouvelleSaisie.tsx';
import { OperationsDuJour } from './ui/OperationsDuJour.tsx';
import { fr } from './ui/composants/BandeauCalcul.tsx';

type Vue = 'accueil' | 'saisie' | 'jour';

export function App() {
  const [contexte, setContexte] = useState<ContexteSaisie | null>(null);
  const [matieres, setMatieres] = useState<MatiereLocale[]>([]);
  const [baremesParMatiere, setBaremes] = useState<Record<string, BaremeLocal[]>>({});
  const [operations, setOperations] = useState<OperationLocale[]>([]);
  const [enAttente, setEnAttente] = useState(0);
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  const [vue, setVue] = useState<Vue>('accueil');
  const [confirmation, setConfirmation] = useState<OperationLocale | null>(null);

  const date = journeeMetier(new Date());

  const rafraichir = useCallback(async (ctx: ContexteSaisie) => {
    const [ops, attente] = await Promise.all([
      operationsDuJour(ctx.siteId, date),
      compterEnAttente(),
    ]);
    setOperations(ops);
    setEnAttente(attente);
  }, [date]);

  useEffect(() => {
    void (async () => {
      await amorcerDemonstration();

      let ctx = await lireContexte();
      if (!ctx) {
        // Première ouverture : contexte d'amorçage. En production il vient de
        // la première connexion en ligne, avec l'appareil enregistré.
        ctx = {
          siteId: demo.site.id, siteCode: demo.site.code,
          responsableId: demo.responsable.id, responsableNom: demo.responsable.nom,
          deviceId: await identifiantAppareil(),
        };
        await ecrireContexte(ctx);
      }
      setContexte(ctx);

      const ms = await matieresActives();
      setMatieres(ms);
      const tous = await db.baremes.toArray();
      const parMatiere: Record<string, BaremeLocal[]> = {};
      for (const b of tous) (parMatiere[b.matiereId] ??= []).push(b);
      setBaremes(parMatiere);

      await rafraichir(ctx);
    })();
  }, [rafraichir]);

  // `navigator.onLine` ment souvent (Wi-Fi capté sans Internet) : la sonde
  // /api/sante tranche. Sans serveur joignable, on reste HORS LIGNE — et
  // l'application fonctionne quand même.
  useEffect(() => {
    let vivant = true;
    async function sonder(): Promise<void> {
      if (!navigator.onLine) { if (vivant) setEnLigne(false); return; }
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 4000);
        const r = await fetch('/api/sante', { signal: c.signal, cache: 'no-store' });
        clearTimeout(t);
        // Un simple 200 ne suffit pas : un portail captif ou une page de repli
        // en renvoie un aussi. Seule une réponse JSON de NOTRE API compte.
        const json = r.ok && r.headers.get('content-type')?.includes('application/json')
          ? ((await r.json()) as { statut?: string })
          : null;
        if (vivant) setEnLigne(json?.statut === 'OK');
      } catch {
        if (vivant) setEnLigne(false);
      }
    }
    void sonder();
    const i = setInterval(() => void sonder(), 30_000);
    const onOnline = () => void sonder();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', () => setEnLigne(false));
    return () => {
      vivant = false;
      clearInterval(i);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  useEffect(() => {
    if (!confirmation) return;
    const t = setTimeout(() => setConfirmation(null), 1500);
    return () => clearTimeout(t);
  }, [confirmation]);

  if (!contexte) return <main><p className="vide">Ouverture…</p></main>;

  return (
    <>
      <Bandeau
        contexte={contexte} enLigne={enLigne} enAttente={enAttente}
        date={date} demonstration={contexte.siteCode === 'SITE-DEMO'}
      />

      {vue === 'accueil' && (
        <Accueil
          nbOperations={operations.length} nbEnAttente={enAttente}
          onNaviguer={setVue}
        />
      )}

      {vue === 'saisie' && (
        <NouvelleSaisie
          contexte={contexte} matieres={matieres} baremesParMatiere={baremesParMatiere}
          onEnregistre={(op) => { setConfirmation(op); void rafraichir(contexte); }}
          onQuitter={() => setVue('accueil')}
        />
      )}

      {vue === 'jour' && (
        <OperationsDuJour
          operations={operations}
          onChange={() => void rafraichir(contexte)}
          onQuitter={() => setVue('accueil')}
        />
      )}

      {confirmation && (
        <div className="confirmation" role="status" data-testid="confirmation">
          <div>
            <div className="coche" aria-hidden="true">✓</div>
            <div className="num">{confirmation.numero}</div>
            <div className="mt">
              {confirmation.montant ? `${fr(confirmation.montant, 2)} ${confirmation.devise}` : 'HORS BARÈME'}
            </div>
            <div className="sy">Enregistré sur l'appareil · EN ATTENTE DE SYNCHRONISATION</div>
          </div>
        </div>
      )}
    </>
  );
}
