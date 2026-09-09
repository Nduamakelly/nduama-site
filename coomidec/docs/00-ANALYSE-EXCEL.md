# 00 — Analyse du fichier Excel source

Fichier analysé : `COOMIDEC_Systeme_Simplifie_Gestion_Site_V3_QTY_Teneur_Couts.xlsx`

## Feuilles présentes

| Feuille | Rôle | Plage utile |
|---|---|---|
| `SAISIE JOURNALIERE` | Saisie des opérations | `A8:I208` (en-têtes ligne 8, données 9→208) |
| `RAPPORT JOURNALIER` | Indicateurs d'une journée | `A3:B15` |
| `TABLEAU DE BORD` | Synthèse + séries pour graphiques | `A3:E208` |
| `BASE CREUSEURS` | Registre des creuseurs | `A3:K203` |
| `PARAMETRES` | En-tête site + barème de teneur | `A3:B7` et `D3:H53` |

## Colonnes de `SAISIE JOURNALIERE`

`N°` · `DATE` · `MATIÈRE PREMIÈRE` · `QTY` · `TENEUR (%)` · `COÛT / UNITÉ` · `COÛT CALCULÉ` · `OBSERVATION` · `SIGNATURE`

- `A` (N°) : `=IF(B9="","",ROW()-8)` → numéro = rang de ligne, **non stable** (dépend de la position).
- `F` (COÛT / UNITÉ) : résolu automatiquement depuis le barème.
- `G` (COÛT CALCULÉ) : calculé.

## Règle de calcul réelle (décodée)

Formule `F9` (coût unitaire) :

```
=IF(OR(C9="",E9=""),"",
  IFERROR(
    LOOKUP(2, 1/((PARAMETRES!$D$4:$D$53 = C9)
               * (E9 >= PARAMETRES!$E$4:$E$53)
               * (E9 <= PARAMETRES!$F$4:$F$53)),
              PARAMETRES!$G$4:$G$53), ""))
```

Formule `G9` (coût calculé) :

```
= D9 * F9 * LOOKUP(... même critère ..., PARAMETRES!$H$4:$H$53)
```

Traduction métier :

```
coutUnitaire = barème(matière, teneur).COUT_UNITE
pctCout      = barème(matière, teneur).PCT_COUT
montant      = QTY x coutUnitaire x pctCout
```

### Conséquences importantes

1. **Seule la méthode « barème par tranches » existe** dans le fichier. La méthode « prix par 1 % » demandée est une **nouveauté**, pas une reprise.
2. Un **troisième facteur `% COÛT`** (colonne `PARAMETRES!H`) intervient dans le montant. Sa signification métier n'est écrite nulle part → à faire préciser (voir `06-QUESTIONS-METIER.md`, Q4).
3. `LOOKUP(2, 1/(...))` renvoie **la dernière ligne qui correspond**. Si deux tranches se chevauchent, c'est la dernière saisie qui gagne, **silencieusement**.
4. Les bornes sont **inclusives des deux côtés** (`>= min` ET `<= max`). Des tranches `0–2` et `2–5` se chevauchent donc exactement à `2`.
5. Si la teneur ne tombe dans **aucune** tranche, `IFERROR` renvoie une cellule vide : l'opération est enregistrée **sans montant**, sans alerte.
6. Le barème n'est **pas horodaté** : modifier un prix recalcule **tout l'historique**. C'est précisément ce que le TEST 3 interdit.

## Indicateurs de `RAPPORT JOURNALIER`

| Indicateur | Formule | Remarque |
|---|---|---|
| Nombre d'enregistrements | `COUNTIF(DATE = date)` | |
| QTY totale | `SUMIF` sur `D` | |
| Teneur moyenne | `SUMIF(E)/COUNTIF` | **moyenne arithmétique, non pondérée par la QTY** → voir Q1 |
| Teneur min / max | `AGGREGATE(15/14, 6, ...)` | |
| Coût total calculé | `SUMIF` sur `G` | |
| Coût moyen / enregistrement | `B13/B8` | |
| Observations enregistrées | `COUNTIFS(... , "<>")` | |

Le filtre est **uniquement la date** — jamais le site, puisqu'un fichier = un site.

## `BASE CREUSEURS`

`ID CREUSEUR` · `NOM` · `POST-NOM` · `PRÉNOM` · `SEXE` · `TÉLÉPHONE` · `N° CARTE ARTISANALE` · `DATE EXPIRATION` · `ÉQUIPE` · `STATUT` · `OBSERVATION`

- `ID CREUSEUR` : `="CR-"&TEXT(ROW()-3,"0000")` → format **`CR-0001`**, également dépendant de la ligne.
- Listes de validation : `SEXE ∈ {H, F}`, `STATUT ∈ {ACTIF, INACTIF}`.
- **Pas de colonne `SITE`** (le fichier est mono-site) — la spécification de l'application en ajoute une.
- **Aucun lien** entre un creuseur et une opération de la feuille de saisie.

## Écarts entre le fichier Excel et la spécification de l'application

Champs demandés dans l'application et **absents** du fichier : `Heure`, `Unité`, `Site` par opération, `Responsable` par opération, `Statut`, `Statut de synchronisation`, `Numéro de clôture`, lien `Creuseur`, `Devise`.

Fonctions demandées et absentes : clôture journalière, verrouillage, journal d'audit, historisation des tarifs, multi-site, multi-utilisateur.

## État des données

Le classeur est un **gabarit vide** : `PARAMETRES!B4:B7` (site, territoire, responsable, mois) sont vides, `PARAMETRES!D4:H53` (barème) est vide, `BASE CREUSEURS` ne contient que les formules d'ID, et aucune ligne de saisie n'est remplie.

**Conséquence : il n'y a aucune donnée réelle COOMIDEC à reprendre.** Le jeu de données de démonstration sera entièrement fictif et clairement marqué comme tel.

Seule note de contenu, en `PARAMETRES!D55` :

> « Principe : pour chaque matière première, renseigner une ou plusieurs tranches de teneur. Le système applique automatiquement le coût/unité et le pourcentage correspondant à la teneur saisie. »
