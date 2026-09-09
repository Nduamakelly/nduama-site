# E — Moteur de calcul

## Emplacement unique

`packages/core/calcul/` — **une seule** fonction publique, pure, déterministe, sans I/O, sans `Date.now()`, sans accès à la base. Aucun écran n'a le droit de calculer un montant.

```ts
export function calculerOperation(entree: EntreeCalcul): ResultatCalcul;
```

Elle est appelée par : le formulaire de saisie (aperçu temps réel), le service d'enregistrement (production du snapshot), l'API à la synchronisation (vérification), et les tests.

## Entrée et sortie

```ts
interface EntreeCalcul {
  qty: Decimal;
  teneur: Decimal;                 // en pourcentage, ex. 3.2 pour 3,2 %
  unite: string;
  matiere: {
    id: string;
    methode: 'PRIX_PAR_POURCENT' | 'BAREME_TRANCHES';
    prixParPourcent?: Decimal;
    formule?: string;              // vide ⇒ formule par défaut de la méthode
    devise: string;
  };
  baremes: BaremeTranche[];        // tranches ACTIVES au moment du calcul
}

interface ResultatCalcul {
  statut: 'CALCULE' | 'HORS_BAREME' | 'INCOMPLET' | 'ERREUR_FORMULE';
  montant: Decimal | null;
  devise: string;
  snapshot: SnapshotCalcul;        // ← stocké dans operations.calcul
  avertissements: string[];
}
```

## Méthode A — prix par 1 % de teneur *(méthode de référence, décision D4)*

```
valeurTeneur = TENEUR × PRIX_PAR_POURCENT
montant      = QTY × VALEUR_TENEUR × PCT_COUT       (PCT_COUT = 1 par défaut)
```

Exemple validé : **cuivre, 1 % = 140 USD**. Teneur 3,2 % → `valeurTeneur = 448 USD` ; QTY 12,5 t → **5 600,00 USD**.

Cette méthode n'existait pas dans le classeur : elle est ajoutée à la suite de la décision D4, qui en fixe la référence tarifaire.

## Méthode B — barème par tranches *(comportement du fichier Excel, conservé pour continuité)*

```
tranche       = barème(matière, teneur)
coutUnitaire  = tranche.COUT_UNITAIRE
pctCout       = tranche.PCT_COUT
montant       = QTY × COUT_UNITAIRE × PCT_COUT
```

C'est la transposition exacte de `SAISIE JOURNALIERE!G9`, avec **deux corrections délibérées** :

| Excel | Application | Pourquoi |
|---|---|---|
| Bornes inclusives des deux côtés (`>= min` **et** `<= max`) | Intervalles semi-ouverts `[min, max)` | Supprime le chevauchement à la borne : `0–2` et `2–5` ne se disputent plus la valeur `2` |
| `LOOKUP(2, 1/…)` prend **la dernière** ligne correspondante en silence | Chevauchement **interdit** à la configuration (contrainte `EXCLUDE` en base + contrôle dans l'écran Barèmes) | Un barème ambigu est un défaut de paramétrage, pas un cas à arbitrer à l'exécution |

**Teneur hors de toute tranche** : Excel enregistre la ligne sans montant, sans alerte. L'application renvoie `statut = 'HORS_BAREME'`, `montant = null`, et affiche un avertissement orange. Comportement à l'enregistrement à trancher (Q3) — recommandation : autoriser l'enregistrement avec le statut `À VALIDER`, jamais un montant nul silencieux.

## Formules configurables sans toucher au code

`matieres_premieres.formule` contient une expression textuelle, évaluée par un **évaluateur restreint** écrit pour ce projet — analyse syntaxique en arbre, puis évaluation. Pas de `eval`, pas de `new Function`, aucune exécution de code arbitraire.

**Variables disponibles**
`QTY` · `TENEUR` · `COUT_UNITAIRE` · `PCT_COUT` · `PRIX_PAR_POURCENT` · `VALEUR_TENEUR`

**Opérateurs** `+ - * / ( )` — **Fonctions** `min(a,b)` · `max(a,b)` · `arrondi(x, n)` · `plafond(x)` · `plancher(x)`

**Formules par défaut**

```
BAREME_TRANCHES     QTY * COUT_UNITAIRE * PCT_COUT
PRIX_PAR_POURCENT   QTY * VALEUR_TENEUR * PCT_COUT        (VALEUR_TENEUR = TENEUR × PRIX_PAR_POURCENT)
```

Toute formule est validée à l'enregistrement dans Paramètres (syntaxe, variables connues, absence de division par zéro sur un jeu d'essai) et testée dans le simulateur avant d'être activée.

## Précision numérique

`decimal.js-light` sur toute la chaîne — jamais de `number` flottant pour de l'argent. `12.5 * 120 * 0.85` en virgule flottante IEEE-754 ne donne pas exactement `1275`.

| Grandeur | Stockage | Arrondi |
|---|---|---|
| QTY | `NUMERIC(18,3)` | 3 décimales |
| Teneur | `NUMERIC(6,3)` | 3 décimales |
| Coût unitaire, prix par 1 % | `NUMERIC(18,4)` | 4 décimales |
| `% coût` | `NUMERIC(9,6)` | stocké en fraction (0,85) et affiché en % (85 %) |
| Montant brut | conservé dans le snapshot | non arrondi |
| Montant final | `NUMERIC(18,2)` | **arrondi commercial (half-up)** à 2 décimales |

Le montant brut **et** le montant arrondi figurent tous deux dans le snapshot : un total de journée se calcule sur les montants arrondis (ce que voit l'agent), et l'écart d'arrondi reste explicable.

## Immuabilité — le mécanisme du TEST 3

À l'enregistrement, `operations.calcul` reçoit un **snapshot complet et autoportant** : méthode, formule, identifiant et version du barème, coût unitaire, `% coût`, devise, entrées, montant brut, montant arrondi, version du moteur, horodatage.

Trois barrières indépendantes garantissent qu'une opération ancienne ne bouge jamais :

1. **Le snapshot** — l'opération porte son tarif ; l'affichage lit le snapshot, jamais la table des barèmes.
2. **L'historisation** — un tarif n'est jamais modifié en place (`valide_du` / `valide_au`), donc l'ancienne valeur reste consultable et vérifiable.
3. **L'absence de recalcul** — aucun chemin de code ne recalcule une opération existante. Une correction contrôlée **crée une nouvelle version tracée**, elle ne réécrit pas l'ancienne.

Une modification de tarif écrit systématiquement une entrée `CHANGEMENT_TARIF` dans `audit_logs`, avec ancienne valeur, nouvelle valeur, auteur et motif.

## Versionnement du moteur

`moteurVersion` (SemVer) est stocké dans chaque snapshot. Si une règle de calcul évolue un jour, on sait exactement quelles opérations ont été produites par quelle version, et on peut rejouer l'ancienne logique pour un contrôle.

## Exemple de bout en bout

```
Matière            Cuivre (méthode BAREME_TRANCHES, devise USD)
Barème actif       [3,00 % – 4,00 %)  →  coût/unité 120,0000 USD  ·  % coût 85 %
Saisie             QTY 12,500 T   ·   teneur 3,200 %

  tranche          [3,00 – 4,00)          ✓ 3,200 y appartient
  formule          QTY * COUT_UNITAIRE * PCT_COUT
  montant brut     12,5 × 120,0000 × 0,85 = 1 275,0000
  MONTANT          1 275,00 USD
```

Le lendemain, le coût unitaire passe à 130 USD dans Paramètres. La ligne du barème est fermée (`valide_au = maintenant`), une nouvelle est ouverte. L'opération ci-dessus affiche **toujours 1 275,00 USD** — son snapshot porte `120,0000` et `0,85`. Une opération saisie après le changement affichera `1 381,25 USD`.

## Couverture de tests prévue

| Test | Objet |
|---|---|
| Résolution de tranche | bornes basse et haute, valeur exactement sur une borne, teneur hors barème |
| Parité Excel | jeu de cas rejouant `G9` pour vérifier l'équivalence de la méthode B |
| Immuabilité | changement de tarif → l'opération antérieure est inchangée (**TEST 3**) |
| Nouvelle matière + barème | création puis saisie → montant attendu (**TEST 4**) |
| Précision décimale | absence de dérive flottante, arrondis half-up |
| Évaluateur de formules | expressions valides, invalides, variable inconnue, division par zéro |
| Cas limites | QTY = 0, teneur = 0, teneur > 100 %, valeurs négatives (refusées) |
