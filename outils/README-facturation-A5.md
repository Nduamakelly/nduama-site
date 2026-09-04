# Maquette KATANGA TECHCARE — V3 (facturation A5 + stock)

Fichier : `Maquette_Katanga_Techcare_V3_Facturation_Stock.xlsx`

## 1. Onglet FACTURE-PROFORMA — impression A5

La feuille a été entièrement remise en page pour tenir sur **une seule page A5 portrait**.

| Réglage | Valeur |
|---|---|
| Format papier | A5 (portrait) |
| Zone d'impression | `A1:F34` |
| Marges | 6 mm gauche/droite, 7 mm haut/bas |
| Ajustement | 1 page en largeur × 1 page en hauteur |
| Largeur des colonnes A à F | 134,7 mm (largeur utile A5 : 135,8 mm) |
| Hauteur des lignes 1 à 34 | 168,6 mm (hauteur utile A5 : 195,8 mm) |

Le document tient donc à **100 % d'échelle**, sans réduction.

### Structure de la page imprimée (A:F)

1. En-tête entreprise (nom, WhatsApp, adresse, référence ANAPI) — tiré de l'onglet PARAMETRES
2. Bandeau du titre : FACTURE ou PROFORMA
3. Bloc document : N° document, date, ID client, lieu
4. Bloc client : nom / société, téléphone, ville, adresse (recherche automatique dans BASE CLIENTS)
5. Tableau des articles : 10 lignes (N°, Réf., Désignation, Qté, P.U. USD, Montant)
6. Observations + Sous-total, Marge société, TOTAL GÉNÉRAL
7. Conditions de paiement
8. Cadres de signature (entreprise / client)
9. Mention de bas de page (une proforma affiche automatiquement sa durée de validité)

### Colonnes G à L — zone de travail, **non imprimées**

Elles restent visibles à l'écran mais sortent de la zone d'impression :

- `I3` TYPE DOCUMENT (FACTURE / PROFORMA) — pilote le titre, le n° de document et la mention de bas de page
- `I4` STATUT (BROUILLON / VALIDÉ / ANNULÉ)
- `I5` Marge % par défaut
- `I9` Contrôle de stock, `I11` nombre de lignes remplies
- Par ligne d'article : Transport, Autres frais, Stock disponible, Marge %, Alerte stock
- Boutons de la maquette (Valider & imprimer / Brouillon / Nouveau document)

Une ligne dont la quantité dépasse le stock disponible se colore automatiquement en rouge.

## 2. Verrouillage des cellules

Toutes les feuilles sont **protégées** : les cellules de formule sont fermées, seules les
cellules de saisie restent modifiables. Sur la facture, les cellules de saisie ont un
**fond gris clair**.

Cellules ouvertes sur FACTURE-PROFORMA :
`I3`, `I4`, `I5`, `F7` (date), `F8` (lieu), `C8` (ID client), `A26` (observations),
`B15:B24` (réf. article), `D15:D24` (quantité), `H15:I24` (transport / autres frais).

Sur les autres onglets, seules les colonnes de saisie sont ouvertes (les colonnes calculées
— coût de revient, prix conseillé, qté sortie, stock, sous-total, marge, total — sont fermées).

Aucun mot de passe n'a été posé : pour modifier une formule, il suffit de faire
**Révision → Ôter la protection de la feuille**, puis de la reprotéger ensuite.

## 3. Autres améliorations

- Listes déroulantes : type de document, statut, ID client (BASE CLIENTS), réf. article
  (BASE ARTICLES, plage étendue à la ligne 500), quantité contrôlée (entier ≥ 0)
- En-tête de la facture et conditions de paiement pilotés par l'onglet PARAMETRES
  (nouveaux paramètres : conditions de paiement, validité proforma, format d'impression,
  nombre de lignes article)
- Numéro de document construit à partir des préfixes et de l'année de PARAMETRES
- Onglets de données : volets figés, filtres automatiques, mise en page A4 paysage avec
  lignes d'en-tête répétées et pied de page paginé
- TABLEAU DE BORD : « Articles en alerte » compare désormais le stock au seuil d'alerte de
  chaque article, et « Ventes du mois » suit le mois en cours au lieu d'une date figée
- Formats de nombres complétés (quantités, montants) et onglets colorés

## 4. Vérification

- Recalcul complet du classeur : **5 071 formules, 0 erreur**.
- Export d'impression : **1 seule page, 148 × 210 mm (A5 portrait exact)** — voir
  `apercu-facture-A5.pdf` / `apercu-facture-A5.png` (aperçu avec 3 lignes d'exemple).

## 5. Point à valider avant utilisation réelle

**La marge est comptée deux fois dans le total.** Ce comportement vient de la maquette
d'origine, il n'a pas été modifié :

- le P.U. de la facture est le *Prix vente conseillé* de BASE ARTICLES,
  soit `coût de revient × (1 + marge %)` — la marge y est donc **déjà incluse** ;
- la ligne « Marge société » du bloc totaux rajoute ensuite `montant × marge %`.

Exemple de l'aperçu : article à 120 $ de coût de revient, marge 30 % → P.U. 156 $,
puis + 30 % à nouveau → le client paie 1,69 × le coût de revient au lieu de 1,3 ×.

L'onglet HISTORIQUE DOCS applique le même calcul (`Total = Sous-total + Sous-total × Marge %`).

Deux corrections possibles, au choix :

1. **Le P.U. inclut la marge** (le plus courant) : `TOTAL GÉNÉRAL` = `Sous-total`,
   et la ligne « Marge société » passe en zone de travail comme information de gestion ;
2. **Le P.U. est le coût de revient** : `F15:F24` va chercher la colonne *Coût de revient*
   (colonne 8) au lieu du *Prix vente conseillé* (colonne 10), et le total actuel reste juste.

Dites-moi laquelle appliquer.
