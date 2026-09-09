# Plan de livraison par modules

Chaque module est livrable, testé et démontrable indépendamment. L'ordre est contraint par les dépendances : le moteur de calcul avant la saisie, la saisie avant la synchronisation, la synchronisation avant la clôture.

| Module | Contenu | Critère de validation couvert |
|---|---|---|
| **M0 — Socle** ✅ | Monorepo, TypeScript, CI, Docker, schéma PostgreSQL, migrations, authentification, rôles | — |
| **M1 — Paramètres** ✅ | Sites, unités, matières premières, barèmes historisés, simulateur | prépare TEST 3, TEST 4 |
| **M2 — Moteur de calcul** ✅ | `@coomidec/core`, évaluateur de formules, snapshot, suite de tests | **TEST 3**, **TEST 4** |
| **M3 — Saisie hors ligne** ✅ | PWA installable, Dexie, formulaire, écriture atomique, aperçu de calcul en direct | **TEST 1** |
| **M4 — Synchronisation** ✅ | Outbox, idempotence, temporisation, écran Synchronisation, pull incrémental | **TEST 2** |
| **M5 — Opérations du jour** | Liste, recherche, filtres, détail, modification, annulation avec motif | — |
| **M6 — Clôture et audit** | Pré-clôture, verrouillage, journal d'audit, procédure de correction contrôlée | **TEST 5**, **TEST 6** |
| **M7 — Rapport journalier** | Rendu A4, aperçu, PDF hors ligne, impression | **TEST 7** |
| **M8 — Tableau de bord** | Indicateurs, filtres, quatre graphiques | — |
| **M9 — Creuseurs** | Registre, recherche instantanée, alertes d'expiration de carte | — |
| **M10 — Livraison** | Jeu de données fictif, README, installation, sauvegarde/restauration, guide agent | — |

## État au 9 septembre 2026

**M0 à M4 sont livrés.** Les **TEST 1, 2, 3 et 4** sont vérifiés automatiquement.

Les deux scénarios de terrain tournent dans un vrai Chromium, sur un profil disque
persistant, avec le serveur réellement arrêté puis redémarré — pas une coupure simulée.

### Les trois protections contre les doublons (TEST 2)

| # | Protection | Où | Ce qu'elle empêche |
|---|---|---|---|
| 1 | UUID généré sur l'appareil | tablette | Un renvoi vise la même ligne, jamais une seconde |
| 2 | Clé d'idempotence `{id}:{version}` | serveur | Un rejeu exact renvoie la réponse mémorisée, sans réécriture |
| 3 | Garde de version en SQL | base | Une charge périmée ne peut pas écraser une donnée plus récente |

Elles sont **indépendantes** : les tests vérifient que la garde SQL protège encore la donnée
après purge des clés d'idempotence, trente jours plus tard.

Une opération n'est retirée de la file **qu'après un accusé serveur la nommant
explicitement**. Si le serveur en oublie une dans sa réponse, elle reste en file : mieux vaut
un doublon rattrapé par l'idempotence qu'une opération perdue.

Les invariants les plus sensibles sont tenus par **la base de données**, pas seulement
par le code applicatif — ils résistent donc aussi à une écriture directe en SQL :

| Invariant | Mécanisme PostgreSQL |
|---|---|
| Deux tranches actives ne peuvent pas se chevaucher | `EXCLUDE USING gist` sur `(matiere_id, numrange, tstzrange)` |
| Un tarif ne se modifie jamais en place | Trigger `baremes_append_only` + `RULE … DO INSTEAD NOTHING` sur `DELETE` |
| Le journal d'audit est inaltérable | `RULE` sur `UPDATE` **et** `DELETE` |
| Une opération clôturée est verrouillée | Trigger `operations_verrou`, levé uniquement par la procédure de correction |
| La méthode A exige son prix de référence | `CHECK (methode <> 'PRIX_PAR_POURCENT' OR prix_par_pourcent IS NOT NULL)` |
| Une seule clôture par site et par jour | Index unique partiel |

## Correspondance avec les critères de validation

| Test | Mécanisme technique | Vérification automatisée |
|---|---|---|
| **1** — 10 opérations hors ligne, fermeture, réouverture | Transaction Dexie atomique `operations` + `outbox` | Playwright, contexte hors ligne, rechargement complet du contexte |
| **2** — Synchronisation unique | UUID d'appareil + `Idempotency-Key` + `ON CONFLICT DO UPDATE` avec garde de version | Test d'intégration : double envoi du même lot → 10 lignes |
| **3** — Ancien tarif préservé | Snapshot dans `operations.calcul` + barèmes `valide_du`/`valide_au` + aucun recalcul | Test unitaire du moteur + test d'intégration bout en bout |
| **4** — Nouvelle matière et barème | `@coomidec/core` avec le barème actif | Test unitaire paramétré |
| **5** — Clôture et verrouillage | `clotures_journalieres` + `operations.verrouillee` + `totaux` figés | Test d'intégration + rejet API à l'écriture |
| **6** — Modification après clôture | Rejet `409`, procédure de correction, entrée `audit_logs` avec ancienne et nouvelle valeur | Test d'intégration : la tentative échoue **et** l'audit existe |
| **7** — Export PDF | pdf-lib côté client, fonctionne hors ligne | Playwright : téléchargement, ouverture, contrôle du contenu |

## Livrables finaux

Code source complet · schéma et migrations PostgreSQL · jeu de données fictif marqué `DÉMONSTRATION` · PWA installable · fonctionnement hors ligne · synchronisation · rapports PDF · README · instructions d'installation · procédures de sauvegarde et de restauration · tests du moteur de calcul · tests de synchronisation hors ligne/en ligne.

**Les données fictives ne seront jamais présentées comme des données réelles COOMIDEC** : elles portent un site nommé `SITE-DEMO`, un bandeau visible dans l'interface et un marqueur en base.
