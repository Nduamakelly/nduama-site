import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App.tsx';
import './styles.css';

// `prompt` et non `autoUpdate` : une mise à jour ne doit jamais recharger
// l'application pendant qu'un agent est en train de saisir une opération.
registerSW({
  onNeedRefresh() {
    // M4 branchera ici une invite discrète, appliquée hors saisie.
  },
});

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
