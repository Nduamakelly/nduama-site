# A — Architecture proposée

## Principe directeur

**Le domaine métier est isomorphe.** Le moteur de calcul, les règles de validation et les invariants de statut vivent dans un paquet TypeScript unique, exécuté **à l'identique** sur la tablette (hors ligne) et sur le serveur (à la synchronisation). Le serveur ne fait jamais confiance au montant envoyé par la tablette : il rejoue le calcul à partir du **snapshot tarifaire** transporté par l'opération et compare.

C'est ce choix qui rend les TEST 3 et TEST 4 démontrables au lieu d'être « espérés ».

## Monorepo

```
coomidec/
├── apps/
│   ├── web/                  PWA React 18 + TypeScript + Vite
│   │   ├── src/ui/           écrans, composants tactiles
│   │   ├── src/db/           Dexie (IndexedDB) : schéma + migrations locales
│   │   ├── src/sync/         outbox, backoff, réconciliation
│   │   └── src/pdf/          rapport A4
│   └── api/                  Node 20 + Fastify + TypeScript
│       ├── src/routes/
│       ├── src/db/           Kysely + migrations SQL versionnées
│       └── src/audit/
├── packages/
│   └── core/                 ★ PARTAGÉ CLIENT + SERVEUR
│       ├── calcul/           moteur de calcul, évaluateur de formules
│       ├── schema/           types + validation Zod
│       └── regles/           transitions de statut, invariants de clôture
├── docs/
├── infra/                    docker-compose, scripts sauvegarde/restauration
└── seed/                     jeu de données fictif
```

## Couches

| # | Couche | Technologie | Responsabilité |
|---|---|---|---|
| 1 | Présentation | React 18 + TypeScript | Écrans tactiles, gros boutons, retour visuel |
| 2 | Domaine | `@coomidec/core` | Calcul, validation, règles de statut — **zéro I/O** |
| 3 | Persistance locale | Dexie / IndexedDB | Miroir des tables + `outbox` + `meta` |
| 4 | Synchronisation | Worker + Background Sync API | File d'attente, reprise, anti-doublon |
| 5 | Transport | REST/JSON, `Idempotency-Key` | Lots de 50 opérations, compression gzip |
| 6 | API | Fastify + Zod | Auth, upsert idempotent, audit, agrégats |
| 7 | Données | PostgreSQL 16 | Source de vérité, historisation tarifaire |

## Pourquoi ces choix

**Vite + `vite-plugin-pwa` (Workbox)** — précache du shell applicatif, mise à jour contrôlée (pas de rechargement pendant une saisie), installable sur Android via `manifest.webmanifest`. Cible prioritaire : Chrome/Android sur tablette, où la *Background Sync API* est disponible.

**Dexie plutôt qu'IndexedDB brut** — transactions multi-tables réellement atomiques. C'est indispensable : l'opération et son entrée d'outbox doivent être écrites **dans la même transaction**, sinon une coupure d'alimentation entre les deux écritures perd la synchronisation (TEST 1).

**Fastify + Kysely** — surface minimale, SQL explicite, migrations lisibles et revues. Aucune dépendance à un fournisseur : l'API tourne dans un conteneur Docker sur un VPS, chez Render/Railway/Fly, ou sur un serveur à Lubumbashi. Postgres est le seul service externe requis.

**Pas de framework « offline » magique** (pas de PouchDB/CouchDB, pas de Firebase). Les données sont financières et auditées : la file de synchronisation doit être lisible, inspectable et réparable à la main par un administrateur. Un moteur de réplication opaque est un risque, pas un gain.

## Authentification en contexte hors ligne

Une tablette peut passer des jours sans réseau ; exiger un aller-retour serveur pour ouvrir une session rendrait l'application inutilisable.

1. **Première connexion — obligatoirement en ligne.** L'appareil est enregistré (`devices`), rattaché à un site, et reçoit un jeton de rafraîchissement longue durée (90 jours).
2. Le profil utilisateur et un **hachage Argon2id du code PIN** sont mis en cache localement.
3. **Ouvertures suivantes — hors ligne.** Déverrouillage par PIN vérifié localement contre le hachage.
4. Chaque opération porte `created_by` + `device_id`. Le serveur revalide ce couple à la synchronisation et refuse un appareil révoqué.

**Révocation** : un appareil perdu est désactivé côté serveur ; il ne pourra plus synchroniser. Les données déjà locales restent lisibles sur l'appareil — d'où la recommandation d'un chiffrement au repos et d'une politique de synchronisation quotidienne obligatoire (voir Q15).

## Rôles

| Rôle | Droits |
|---|---|
| `AGENT` | Saisir, modifier ses opérations du jour avant clôture, consulter |
| `SUPERVISEUR` | Tout `AGENT` + annuler avec motif, clôturer la journée, imprimer |
| `ADMIN` | Tout + paramètres, matières, barèmes, utilisateurs, réouverture de clôture |

## Déploiement

```
Tablette (PWA)  ──HTTPS──▶  Reverse proxy (Caddy, TLS auto)
                                   │
                                   ▼
                            API Fastify (Docker)
                                   │
                                   ▼
                           PostgreSQL 16 (Docker + volume)
                                   │
                                   ▼
                    pg_dump quotidien chiffré → stockage externe
```

Le serveur est conçu pour être hébergé plus tard : aucune dépendance à un service propriétaire, configuration entièrement par variables d'environnement, `docker compose up` suffit pour un poste local ou un VPS.
