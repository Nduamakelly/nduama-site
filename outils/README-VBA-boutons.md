# Boutons VBA — Maquette KATANGA TECHCARE

Fichier à utiliser : **`Maquette_Katanga_Techcare_V3_Facturation_Stock.xlsm`**
(le `.xlsx` reste disponible, mais un classeur `.xlsx` ne peut pas contenir de macro).

Le classeur contient déjà les **6 boutons cliquables**, chacun relié au nom de sa macro.
Il ne reste qu'à importer le code VBA une seule fois — 2 minutes.

## 1. Importer le code (une seule fois)

1. Ouvrir `Maquette_Katanga_Techcare_V3_Facturation_Stock.xlsm` dans Excel.
2. À la bande jaune de sécurité, cliquer sur **Activer les macros**.
   (Si le fichier vient d'Internet : clic droit sur le fichier → **Propriétés** →
   cocher **Débloquer** → OK, puis rouvrir.)
3. Appuyer sur **Alt + F11** pour ouvrir l'éditeur VBA.
4. Menu **Fichier → Importer un fichier…** (ou Ctrl + M), puis importer, un par un,
   les trois fichiers du dossier `vba` :
   - `mdlOutils.bas`
   - `mdlFacturation.bas`
   - `mdlBases.bas`
5. **Alt + Q** pour revenir à Excel, puis enregistrer (Ctrl + S).

Les boutons sont opérationnels.

> Si Excel affiche « L'accès au projet Visual Basic n'est pas approuvé », allez dans
> **Fichier → Options → Centre de gestion de la confidentialité → Paramètres →
> Paramètres des macros** et cochez *Accès approuvé au modèle d'objet du projet VBA*.

## 1 bis. Mettre à jour le code déjà importé

Si vous avez déjà importé une version précédente, **supprimez d'abord les anciens
modules**, sinon Excel signalera « Nom ambigu détecté » :

1. **Alt + F11**, dans l'arborescence de gauche, clic droit sur `mdlOutils` →
   **Supprimer mdlOutils** → **Non** (ne pas exporter). Idem pour `mdlFacturation`
   et `mdlBases`.
2. Réimporter les trois `.bas` comme à l'étape 4 ci-dessus, puis enregistrer.

## 2. Ce que fait chaque bouton

### Onglet FACTURE-PROFORMA

| Bouton | Macro | Action |
|---|---|---|
| ✅ VALIDER & IMPRIMER | `ValiderEtImprimer` | Contrôle la saisie et le stock, demande confirmation, écrit le document dans HISTORIQUE DOCS au statut **VALIDÉ**, ajoute les lignes de SORTIE dans JOURNAL STOCK (facture seulement), exporte le **PDF au format A5** puis vide le formulaire |
| 🧾 ENREGISTRER BROUILLON | `EnregistrerBrouillon` | Écrit le document au statut **BROUILLON**. Aucune sortie de stock, aucun PDF. Le numéro est mémorisé en `I40` : le formulaire reste modifiable et le prochain enregistrement **remplace** ces lignes au lieu d'en ajouter |
| 🧹 NOUVEAU DOCUMENT | `NouveauDocument` | Vide le formulaire après confirmation et repart sur un numéro neuf |

### Autres onglets

| Onglet | Bouton | Macro | Action |
|---|---|---|---|
| BASE CLIENTS | ➕ AJOUTER CLIENT | `AjouterClient` | Lit le formulaire `P4:P12`, crée la fiche avec un ID `CLI-000n`, vide le formulaire |
| BASE ARTICLES | ➕ ENREGISTRER ARTICLE | `EnregistrerArticle` | Lit le formulaire `S4:S13`, crée l'article (`ART-000n`, ou `SRV-000n` si la catégorie est « Service ») avec ses formules de coût de revient et de prix conseillé |
| ENTREES STOCK | ✅ VALIDER L'ENTRÉE STOCK | `ValiderEntreeStock` | Lit le formulaire `B4:B11`, ajoute la ligne `ENT-000n` au journal des entrées, augmente la quantité entrée de l'article, propose de mettre à jour son coût d'achat, et trace le mouvement dans JOURNAL STOCK |

## 3. Points de fonctionnement

**Le stock.** `BASE ARTICLES` colonne L additionne, par formule, les quantités des
factures **VALIDÉ**es de l'historique. La macro n'a donc pas à écrire le stock : il suit
automatiquement. Le libellé du statut est lu dans `PARAMETRES!B13` — si vous le changez
là, tout le reste suit.

**Les PDF** sont écrits dans un sous-dossier `Documents`, créé automatiquement à côté du
classeur, sous le nom du document (`KTC-FAC-2026-003.pdf`). Le classeur doit donc être
enregistré sur le disque avant la première validation.

**La numérotation** repart du plus grand numéro déjà présent dans HISTORIQUE DOCS pour ce
type et cette année (cellules `I38`/`I39` de la zone de travail) : pas de doublon, même
après une suppression de lignes.

**La protection.** Les feuilles sont protégées sans mot de passe et les macros
l'enlèvent puis la remettent automatiquement à chaque écriture. Si vous posez un mot de
passe dans Excel, reportez-le dans la constante `MDP_FEUILLE` en haut de `mdlOutils.bas`.

**Contrôles avant validation** : type de document choisi, client existant, date valide,
au moins une ligne, référence article connue, quantité > 0, et — pour une facture — stock
suffisant sur chaque ligne. Une proforma ne touche jamais au stock.

## 4. Si vous préférez repartir du .xlsx

Le `.xlsm` est produit à partir du `.xlsx` par le script `add_boutons_vba.py`
(il ajoute les formes-boutons et bascule le classeur en macro-compatible) :

```bash
python3 build_maquette_v3.py    # construit le .xlsx
python3 add_boutons_vba.py      # produit le .xlsm avec les boutons
```
