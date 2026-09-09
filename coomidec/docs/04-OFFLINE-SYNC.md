# D — Workflow offline / online

## Règle absolue

**Aucune écriture métier ne passe par le réseau.** L'interface écrit dans IndexedDB, puis rend la main. La synchronisation est un processus d'arrière-plan qui n'a jamais le droit de bloquer, ralentir ou faire échouer une saisie.

## Écriture d'une opération — transaction atomique

```ts
await db.transaction('rw', db.operations, db.outbox, async () => {
  await db.operations.add(operation);          // avec son snapshot de calcul
  await db.outbox.add({
    entite: 'operation',
    entite_id: operation.id,
    version: operation.version,          // 1 à la création
    charge: operation,
    statut: 'EN_ATTENTE',
    tentatives: 0,
    prochain_essai_le: Date.now(),
  });
});
// ↓ seulement ici
afficherConfirmation();
```

Les deux écritures réussissent ou échouent **ensemble**. Il ne peut pas exister d'opération sans entrée d'outbox, ni l'inverse. C'est ce qui garantit le **TEST 1** : coupure d'alimentation, fermeture forcée de l'application, redémarrage de la tablette — les dix opérations sont là, et elles sont toujours en file.

## Cycle de vie d'un élément d'outbox

```
BROUILLON ──enregistrer──▶ EN_ATTENTE ──▶ EN_COURS ──▶ SYNCHRONISE
                                │            │
                                │            ├──erreur réseau──▶ EN_ATTENTE (backoff)
                                │            ├──erreur 4xx────▶ ERREUR (intervention)
                                │            └──version obsolète─▶ CONFLIT (arbitrage)
                                │
                                └──7 échecs──▶ ERREUR
```

`EN_ATTENTE` est affiché **« EN ATTENTE DE SYNCHRONISATION »**, `SYNCHRONISE` affiché **« SYNCHRONISÉ »**, comme demandé.

## Déclencheurs de synchronisation

| Déclencheur | Source |
|---|---|
| Retour de connexion | événement `online` + sonde `/api/sante` (l'événement `online` ment souvent : Wi-Fi capté sans Internet) |
| Application repassée au premier plan | `visibilitychange` |
| Périodique | toutes les 5 minutes tant que la file n'est pas vide |
| Système | *Background Sync API* — synchronise même application fermée (Chrome/Android) |
| Manuel | bouton `SYNCHRONISER MAINTENANT` |

## Montée (push)

Lots de 50 éléments maximum, dans l'ordre d'insertion (`seq` croissant), pour préserver la causalité (une opération avant sa clôture).

```http
POST /api/sync/push
Authorization: Bearer <jwt>
Idempotency-Key: 9a3f…c1:1        ← "{operation_id}:{version}"
X-Device-Id: A7F3…
```

Côté serveur :

```sql
INSERT INTO operations (...) VALUES (...)
ON CONFLICT (id) DO UPDATE
   SET ...
 WHERE operations.version < EXCLUDED.version      -- anti-régression
   AND operations.verrouillee = false;            -- anti-écrasement d'une clôture
```

Trois protections superposées contre les doublons :

1. **UUID généré sur l'appareil** — un renvoi vise la même ligne, pas une nouvelle.
2. **`Idempotency-Key`** — un rejeu exact renvoie la réponse mémorisée, sans réécriture.
3. **Garde de version** — une charge périmée ne peut pas écraser une donnée plus récente.

C'est le **TEST 2** : dix opérations envoyées deux fois donnent dix lignes.

Suppression de l'entrée d'outbox **uniquement** après réception du `200` et de l'accusé serveur portant l'`id` correspondant.

## Descente (pull)

Curseur incrémental sur une séquence serveur monotone :

```http
GET /api/sync/pull?depuis_seq=41827&site=KOL
```

Retourne les changements de `matieres_premieres`, `baremes_teneur`, `creuseurs`, `sites`, `unites`, `parametres`, `clotures_journalieres` et les opérations des autres appareils du même site.

**Les référentiels sont tirés avant l'envoi des opérations** : un appareil qui saisit avec un barème périmé doit d'abord recevoir le barème à jour. Les opérations déjà enregistrées ne sont pas recalculées pour autant — leur snapshot fait foi.

## Reprise et temporisation

Délais : `1s → 2s → 4s → 8s → 30s → 2min → 5min` (plafond), avec **gigue aléatoire ±20 %** pour éviter que toutes les tablettes d'un site se reconnectent au même instant.

Après 7 échecs consécutifs : statut `ERREUR`, l'élément quitte la boucle automatique et devient visible dans l'écran Synchronisation avec un message lisible et un bouton `Réessayer`. Il n'est **jamais** abandonné.

## Conflits

Les opérations sont essentiellement en insertion : les conflits sont rares mais doivent être traités, jamais résolus en silence.

| Cas | Traitement |
|---|---|
| Même opération modifiée sur deux appareils | Version serveur conservée, version locale rangée en `CONFLIT`, arbitrage par un `SUPERVISEUR`, les deux valeurs restent tracées |
| Opération modifiée alors que la journée a été clôturée entre-temps | Rejet `409`, l'opération passe en `CORRECTION_REQUISE` et exige la procédure contrôlée |
| Deux clôtures pour le même site et le même jour | La première arrivée gagne (`UNIQUE (site_id, date_journee)`), la seconde est signalée pour arbitrage |
| Appareil révoqué | Rejet `403`, données conservées localement, export manuel possible |

**Jamais de « dernier écrivain gagne » sur une donnée financière.**

## Horloges

Une tablette hors ligne peut avoir une horloge fausse. Chaque enregistrement porte donc :

`heure_appareil` (déclarée par la tablette) · `heure_serveur` (posée à la réception) · `decalage_horloge_ms` (calculé à la synchronisation).

Un écart supérieur à 5 minutes déclenche un avertissement à l'écran et une entrée d'audit. Fuseau de référence : `Africa/Lubumbashi` (UTC+2, sans changement d'heure). Les dates métier (`date_operation`, `date_journee`) sont des `DATE` en heure locale du site, **jamais** des UTC convertis — une opération du 9 septembre à 23 h doit appartenir à la journée du 9.

## Budget de stockage

Une opération ≈ 1,2 Ko en IndexedDB (hors signature). 200 opérations/jour × 90 jours ≈ 22 Mo — largement sous les quotas Android. Les signatures sont compressées en PNG ≤ 20 Ko. Purge locale des opérations synchronisées et clôturées de plus de 90 jours, **après confirmation de leur présence côté serveur**.
