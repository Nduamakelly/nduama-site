# COOMIDEC — Application de gestion des opérations de site minier

Remplacement progressif du classeur *COOMIDEC Système Simplifié Gestion Site*
par une application web progressive (PWA) **offline-first**, utilisable sur
tablette Android sur les sites, sans connexion Internet.

> **État actuel : modules M0 à M4 livrés.**
> Les **TEST 1, 2, 3 et 4** sont vérifiés automatiquement.
> Prochaine étape : M5 (opérations du jour) et M6 (clôture, **TEST 5 et 6**).

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

## Installation

Il faut Node 20+ et PostgreSQL 16.

```bash
cd coomidec
cp .env.example .env          # puis renseignez DATABASE_URL et JWT_SECRET
npm install
npm run migrate --workspace @coomidec/api
npm run seed    --workspace @coomidec/api   # jeu de démonstration, facultatif
npm run start   --workspace @coomidec/api
```

Ou bien, tout d'un coup :

```bash
cd coomidec/infra
POSTGRES_PASSWORD=… JWT_SECRET=… docker compose up
```

### Vérifier

```bash
npm run typecheck
npm test                      # 76 tests : 43 moteur + 19 API + 14 base locale
npm run e2e --workspace @coomidec/web   # TEST 1 dans un vrai navigateur
```

Les tests de l'API tournent contre un vrai PostgreSQL — renseignez `DATABASE_URL`
avant de les lancer. La CI (`.github/workflows/coomidec.yml`) démarre un service
`postgres:16` pour eux.

### Sauvegarde et restauration

```bash
export DATABASE_URL=… BACKUP_PASSPHRASE=…
./infra/sauvegarde.sh ./sauvegardes          # pg_dump + gzip + chiffrement AES256
./infra/restauration.sh ./sauvegardes/coomidec-20260909-1400.sql.gz.gpg
```

La base contient des données personnelles de creuseurs (nom, téléphone, numéro de
carte artisanale) : `BACKUP_PASSPHRASE` n'est pas facultatif en production, et la
restauration exige une confirmation explicite parce qu'elle écrase la base cible.

### Jeu de démonstration

`npm run seed` crée un site `SITE-DEMO` marqué `demonstration = true`, deux matières
premières, un barème, six creuseurs et trois comptes (`admin`, `superviseur`, `agent`).

**Ces données sont entièrement fictives et ne doivent jamais servir de données réelles
COOMIDEC.** Le classeur fourni était vide : il n'existe aucun historique à reprendre.

## Tablette — `apps/web`

PWA React 18 + Vite + Dexie, installable, utilisable sans réseau.

```bash
npm run dev   --workspace @coomidec/web    # http://localhost:5173
npm run build --workspace @coomidec/web
```

L'écriture d'une opération et son entrée de file de synchronisation sont
faites **dans une seule transaction IndexedDB** : les deux réussissent ou
échouent ensemble. C'est ce qui garantit le TEST 1 — pas la discipline du
code appelant.

| Fichier | Rôle |
|---|---|
| `src/db/dexie.ts` | Schéma local : `operations`, `outbox`, référentiels, `meta` |
| `src/db/operations.ts` | Écriture atomique, annulation à motif, aperçu de calcul |
| `src/db/numero.ts` | Numéro définitif dès la création, journée métier locale |
| `src/db/referentiels.ts` | Matières, barèmes, recherche instantanée des creuseurs |
| `src/sync/moteur.ts` | File d'attente, temporisation avec gigue, reprise, export de secours |
| `e2e/test1-hors-ligne.spec.ts` | **TEST 1** — serveur arrêté, application fermée puis rouverte |
| `e2e/test2-synchronisation.spec.ts` | **TEST 2** — serveur redémarré, envoi unique vérifié |

## Moteur de calcul — `packages/core`

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

## API — `apps/api`

Fastify + Kysely + PostgreSQL 16. Le serveur rejoue le calcul à la réception :
il ne fait jamais confiance au montant envoyé par la tablette.

| Route | Rôle |
|---|---|
| `GET /api/sante` | Sonde de connectivité — l'événement `online` du navigateur ment souvent |
| `POST /api/auth/connexion` | Jeton JWT ; message identique que l'identifiant existe ou non |
| `POST /api/auth/pin` | PIN de déverrouillage hors ligne, haché en Argon2id |
| `GET/POST /api/sites`, `/api/unites` | Référentiels |
| `GET/POST/PATCH /api/matieres` | Matières premières ; un changement de prix exige un motif |
| `GET/POST /api/matieres/:id/baremes` | Tranches actives ou historique complet |
| `PUT /api/baremes/:id` | **Ferme** la tranche et en ouvre une nouvelle — jamais de modification en place |
| `POST /api/matieres/:id/simuler` | Simulateur de l'écran Paramètres, même moteur que la tablette |
| `POST /api/sync/push` | Montée idempotente d'un lot ; le serveur **rejoue le calcul** et rejette un montant falsifié |
| `GET /api/sync/pull` | Descente incrémentale par curseur (`sequence_serveur`, ordre total) |
| `GET /api/sync/etat/:deviceId` | Derniers lots reçus d'un appareil |

Les invariants critiques sont tenus par la base elle-même (contrainte `EXCLUDE`,
triggers, `RULE`), pas seulement par le code : ils résistent à une écriture SQL directe.
Voir [`docs/07-PLAN-LIVRAISON.md`](docs/07-PLAN-LIVRAISON.md).

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

Module **M3** — PWA installable, saisie hors ligne, écriture atomique dans IndexedDB
(critère **TEST 1**), puis **M4** — synchronisation idempotente (critère **TEST 2**).

Un point reste à préciser avant la mise en production : le rôle exact de `% COÛT`
en méthode B — voir la fin de [`docs/08-DECISIONS.md`](docs/08-DECISIONS.md).
Il ne bloque pas le développement, la formule étant une donnée de configuration.
