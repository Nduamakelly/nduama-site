# Décisions validées

Réponses obtenues sur les quatre questions bloquantes. Elles sont désormais
appliquées dans le code et dans les documents de conception.

---

## D1 — Teneur moyenne : les deux, affichées côte à côte

*(répond à Q1)*

- **Indicateur principal** : moyenne **pondérée par la QTY** — `Σ(qty × teneur) / Σ qty`
- **Affichée à côté, explicitement libellée** : moyenne arithmétique, telle que la calcule le classeur

Rapport journalier, clôture et tableau de bord affichent les deux, pour que les
chiffres de l'application restent rapprochables de ceux du fichier Excel.

Implémenté dans `packages/core/src/agregats.ts`, testé dans `tests/agregats.test.ts`.

## D4 — La référence tarifaire est un prix par 1 % de teneur

*(répond à Q4)*

> « C'est la valeur qui représente la matière première ; par exemple Cuivre, teneur 1 % = 140 $ »

La **méthode A (prix par 1 %)** devient donc la méthode de référence :

```
valeurTeneur = TENEUR × PRIX_PAR_POURCENT        3,2 % × 140 = 448 USD
montant      = QTY × VALEUR_TENEUR × PCT_COUT    12,5 × 448 × 1 = 5 600 USD
```

La méthode B (barème par tranches) reste disponible, matière par matière, pour
la continuité avec le classeur.

> ⚠️ **Point restant à préciser** — dans la méthode B, la colonne `PARAMETRES!H`
> (`% COÛT`) multiplie encore le montant. Le moteur la conserve comme facteur
> configurable, **par défaut égal à 1**. Voir « Question restante » plus bas.

## D5 — Le montant est une valeur de production

*(répond à Q5)*

Le `COÛT CALCULÉ` du classeur est une **valeur de production estimée**, pas un
décaissement. Conséquences :

- l'intitulé devient **« VALEUR »** (et non « coût ») dans les écrans, le rapport journalier et le tableau de bord ;
- le rapport journalier est un **rapport de production**, pas un journal d'achats ;
- aucun rapprochement de trésorerie n'est attendu de l'application.

## D8 — Le creuseur est obligatoire sur chaque opération

*(répond à Q8)*

Chaque opération est **nominative**. Conséquences sur le modèle et sur les écrans :

- `operations.creuseur_id` devient **`NOT NULL`** ;
- l'écran de saisie ajoute une **quatrième saisie obligatoire** : recherche du creuseur par nom ou n° de carte artisanale ;
- le rapport journalier gagne une **ventilation par creuseur** (nombre d'opérations, QTY, valeur) ;
- l'application devient de fait une **base de rémunération individuelle** : les contestations porteront sur ses chiffres, ce qui renforce l'exigence sur le journal d'audit et sur la signature (Q12) ;
- Q13 (carte artisanale expirée) devient plus sensible : une opération nominative attribuée à une carte périmée est désormais un cas réel, à trancher.

**Conséquence sur l'ergonomie** : la cible de « 3 champs saisis » passe à 4. Pour
tenir l'objectif de rapidité, l'écran de saisie proposera les **creuseurs récents
de l'équipe en cours** en accès direct, la recherche complète restant disponible.

---

## Question restante — précision sur `% COÛT` en méthode B

La réponse D4 définit la valeur de référence (140 USD le point de teneur pour le
cuivre) mais ne dit pas ce que devient la colonne `% COÛT` du classeur. Deux
lectures possibles :

| | Lecture | Formule | Exemple : cuivre, 12,5 t, teneur 3,2 % |
|---|---|---|---|
| **1** | `% COÛT` est la **teneur retenue pour la tranche**. Les deux méthodes sont alors la même formule, la méthode B se contentant de discrétiser la teneur. | `QTY × PRIX_PAR_POURCENT × TENEUR` | `12,5 × 140 × 3,2 =` **5 600 USD** |
| **2** | `% COÛT` est un **facteur distinct** (part, rendement ou décote) qui s'applique en plus. | `QTY × VALEUR_TENEUR × PCT_COUT` | avec 85 % : `5 600 × 0,85 =` **4 760 USD** |

**Ce point ne bloque pas le développement** : la formule est une donnée de
configuration, pas du code. Le moteur implémente les deux, `PCT_COUT` vaut 1 par
défaut, et le choix se fait dans PARAMÈTRES — sans nouvelle livraison.

Il faudra néanmoins trancher **avant la mise en production**, car les deux
lectures donnent des montants différents.
