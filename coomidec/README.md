# COOMIDEC — Application de gestion des opérations de site minier

Remplacement progressif du classeur *COOMIDEC Système Simplifié Gestion Site*
par une application web progressive (PWA) **offline-first**, utilisable sur
tablette Android sur les sites, sans connexion Internet.

> **État actuel : phase de conception.** Aucun code applicatif n'est encore
> écrit — conformément à la demande, l'architecture est présentée et validée
> avant le développement.

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

Validation des **4 questions bloquantes** de [`docs/06-QUESTIONS-METIER.md`](docs/06-QUESTIONS-METIER.md) — Q1, Q4, Q5, Q8 — puis démarrage du module **M0**.
