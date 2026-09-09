# COOMIDEC — Application de gestion des opérations de site minier

Remplacement progressif du classeur *COOMIDEC Système Simplifié Gestion Site*
par une application web progressive (PWA) **offline-first**, utilisable sur
tablette Android sur les sites, sans connexion Internet.

> **État actuel : conception validée, module M2 livré.**
> Les quatre questions bloquantes ont été tranchées ([`docs/08-DECISIONS.md`](docs/08-DECISIONS.md))
> et le moteur de calcul `@coomidec/core` est écrit et testé (43 tests).

## Documents de conception

| Document | Contenu |
|---|---|
| [`docs/00-ANALYSE-EXCEL.md`](docs/00-ANALYSE-EXCEL.md) | Décodage du classeur source : formules, règle de calcul réelle, écarts |
| [`docs/01-ARCHITECTURE.md`](docs/01-ARCHITECTURE.md) | **A** — Architecture, monorepo, couches, authentification hors ligne |
| [`docs/02-MODELE-DONNEES.md`](docs/02-MODELE-DONNEES.md) | **B** — Tables PostgreSQL, snapshot de calcul, schéma IndexedDB |
| [`docs/03-ECRANS.md`](docs/03-ECRANS.md) | **C** — Les neuf écrans et l'ergonomie tablette |
| [`docs/04-OFFLINE-SYNC.md`](docs/04-OFFLINE-SYNC.md) | **D** — File d'attente, idempotence, conflits, horloges |
| [`docs/05-MOTEUR-CALCUL.md`](docs/05-MOTEUR-CALCUL.md) | **E** — Moteur centralisé, deux méthodes, immuabilité des tarifs |
| [`docs/06-QUESTIONS-METIER.md`](docs/06-QUESTIONS-METIER.md) | **F** — 20 points à valider, dont 4 bloquants |
| [`docs/07-PLAN-LIVRAISON.md`](docs/07-PLAN-LIVRAISON.md) | Modules M0 → M10 et couverture des sept critères de validation |
| [`docs/08-DECISIONS.md`](docs/08-DECISIONS.md) | **D1, D4, D5, D8** — décisions validées et leurs conséquences |

## Moteur de calcul — `packages/core`

```bash
npm install
npm test          # 43 tests, dont TEST 3 et TEST 4 des critères de validation
```

Fonction pure, sans I/O, partagée entre la tablette et le serveur :

```ts
import { calculerOperation } from '@coomidec/core';

calculerOperation({
  qty: '12.5', teneur: '3.2',
  matiere: { methode: 'PRIX_PAR_POURCENT', prixParPourcent: '140', devise: 'USD', /* … */ },
  calculeA: '2026-09-09T08:14:03+02:00',
});
// → montant '5600.00', snapshot autoportant figeant le tarif appliqué
```

| Fichier | Rôle |
|---|---|
| `src/calcul.ts` | `calculerOperation` et `verifierSnapshot` (revérification serveur) |
| `src/formule.ts` | Évaluateur d'expressions restreint — **sans `eval`** |
| `src/bareme.ts` | Résolution de tranche, détection des chevauchements et des trous |
| `src/agregats.ts` | Teneur moyenne pondérée **et** arithmétique, totaux de journée |

## Ce que le classeur fait aujourd'hui

```
coutUnitaire = barème(matière, teneur).COUT_UNITE
pctCout      = barème(matière, teneur).PCT_COUT
montant      = QTY × coutUnitaire × pctCout
```

Trois limites que l'application corrige :

1. Modifier un prix **recalcule tout l'historique** — l'application fige un snapshot tarifaire par opération.
2. Des tranches qui se chevauchent sont arbitrées **silencieusement** — l'application interdit le chevauchement à la configuration.
3. Une teneur hors barème produit une ligne **sans montant et sans alerte** — l'application signale `HORS BARÈME`.

## Pile technique retenue

React 18 + TypeScript + Vite (PWA, Workbox) · Dexie / IndexedDB · Fastify + Kysely · PostgreSQL 16 · moteur de calcul partagé client/serveur dans `packages/core`.

## Version consultable

Dossier de conception mis en page : https://claude.ai/code/artifact/a003aeb1-ecf3-4e99-a03e-73487a2a0e48
(source : `docs/dossier-conception.html`)

## Prochaine étape

Modules **M0** (socle API + PostgreSQL) et **M1** (paramètres, matières, barèmes historisés),
puis **M3** (saisie hors ligne) et **M4** (synchronisation).

Un point reste à préciser avant la mise en production : le rôle exact de `% COÛT`
en méthode B — voir la fin de [`docs/08-DECISIONS.md`](docs/08-DECISIONS.md).
Il ne bloque pas le développement, la formule étant une donnée de configuration.
