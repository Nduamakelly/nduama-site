# -*- coding: utf-8 -*-
"""Réorganise la maquette KATANGA TECHCARE :
   - onglet FACTURE-PROFORMA entièrement remis en page pour une impression A5 portrait
     (1 page, zone d'impression A1:F34, colonnes de travail H:L hors impression)
   - mise en page / figeage / filtres / formats sur les autres onglets
"""
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, Protection
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule, CellIsRule
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.properties import PageSetupProperties
from copy import copy

SRC = 'maquette.xlsx'
OUT = '/home/user/nduama-site/outils/Maquette_Katanga_Techcare_V3_Facturation_Stock.xlsx'

# ---------------------------------------------------------------- charte
ROUGE   = 'D71920'
NOIR    = '111111'
GRIS    = '4B5563'
GRIS2   = '6B7280'
CLAIR   = 'F5F5F5'
BLANC   = 'FFFFFF'
NOTE_BG = 'FFF7ED'
NOTE_FG = '9A3412'
BORD    = 'D0D0D0'
FONT    = 'Calibri'

def F(sz=9, b=False, color=NOIR, i=False):
    return Font(name=FONT, size=sz, bold=b, italic=i, color=color)

def fill(c):
    return PatternFill('solid', fgColor=c)

thin  = Side(style='thin', color=BORD)
box   = Border(left=thin, right=thin, top=thin, bottom=thin)
hair  = Side(style='thin', color=ROUGE)

def cellules(ws, ref):
    """Normalise ws[ref] en une liste plate de cellules."""
    bloc = ws[ref]
    if not isinstance(bloc, tuple):
        return [bloc]
    plat = []
    for elt in bloc:
        plat.extend(elt if isinstance(elt, tuple) else (elt,))
    return plat


def style(ws, ref, font=None, bg=None, align=None, border=None, fmt=None, verrou=None):
    """Applique un style (et éventuellement le verrouillage) sur une cellule ou une plage."""
    for c in cellules(ws, ref):
        if font is not None:   c.font = font
        if bg is not None:     c.fill = fill(bg)
        if align is not None:  c.alignment = align
        if border is not None: c.border = border
        if fmt is not None:    c.number_format = fmt
        if verrou is not None: c.protection = Protection(locked=verrou)


def deverrouiller(ws, *refs):
    """Ouvre les cellules de saisie (les autres restent verrouillées)."""
    for ref in refs:
        for c in cellules(ws, ref):
            c.protection = Protection(locked=False)

L  = Alignment(horizontal='left',   vertical='center', wrap_text=False)
LW = Alignment(horizontal='left',   vertical='top',    wrap_text=True)
C_ = Alignment(horizontal='center', vertical='center', wrap_text=False)
CW = Alignment(horizontal='center', vertical='center', wrap_text=True)
R_ = Alignment(horizontal='right',  vertical='center', wrap_text=False)

USD = '$#,##0.00'
PCT = '0%'
DATE = 'dd/mm/yyyy'

wb = openpyxl.load_workbook(SRC)

# ============================================================================
# 1. PARAMETRES : quelques paramètres supplémentaires utilisés par la facture
# ============================================================================
par = wb['PARAMETRES']
extra = [
    ('Conditions de paiement', '50% à la commande / 50% au retrait'),
    ('Validité proforma (jours)', 15),
    ('Format d’impression du document', 'A5 portrait (1 page)'),
    ('Nombre de lignes article par document', 10),
]
for i, (k, v) in enumerate(extra, start=15):
    par.cell(row=i, column=1, value=k)
    par.cell(row=i, column=2, value=v)
# on reprend le style des lignes existantes
for i in range(15, 19):
    for col in (1, 2):
        src = par.cell(row=14, column=col)
        dst = par.cell(row=i, column=col)
        dst.font = copy(src.font); dst.fill = copy(src.fill)
        dst.border = copy(src.border); dst.alignment = copy(src.alignment)
par['B18'].number_format = 'General'

# ============================================================================
# 2. FACTURE-PROFORMA : reconstruction complète, calibrée A5 portrait
# ============================================================================
idx = wb.sheetnames.index('FACTURE-PROFORMA')
del wb['FACTURE-PROFORMA']
ws = wb.create_sheet('FACTURE-PROFORMA', idx)
ws.sheet_view.showGridLines = False

# --- largeurs : A:F = 511 px ≈ 135 mm => tient dans la largeur utile d'un A5
widths = {'A': 4.2, 'B': 12.0, 'C': 25.5, 'D': 5.5, 'E': 10.0, 'F': 11.5,
          'G': 2.0, 'H': 17.0, 'I': 16.0, 'J': 12.0, 'K': 10.0, 'L': 20.0}
for col, w in widths.items():
    ws.column_dimensions[col].width = w

heights = {1: 24, 2: 12, 3: 12, 4: 5, 5: 22, 6: 5, 7: 16, 8: 16, 9: 14,
           10: 15, 11: 15, 12: 15, 13: 6, 14: 16,
           25: 14, 26: 15, 27: 18, 28: 15, 29: 6,
           30: 16, 31: 16, 32: 16, 33: 5, 34: 14}
for r in range(15, 25):
    heights[r] = 15
for r, h in heights.items():
    ws.row_dimensions[r].height = h

PREM_LIGNE, DERN_LIGNE = 15, 24   # lignes articles

# ---------------------------------------------------------------- en-tête
ws.merge_cells('A1:C1'); ws.merge_cells('D1:F1')
ws['A1'] = '=PARAMETRES!$B$4'
style(ws, 'A1', F(14, True, ROUGE), align=Alignment(horizontal='left', vertical='center'))
ws['D1'] = '="WhatsApp : "&PARAMETRES!$B$5'
style(ws, 'D1', F(7.5, color=GRIS), align=Alignment(horizontal='right', vertical='center'))

# l'adresse occupe toute la largeur : elle est trop longue pour un demi-A5
ws.merge_cells('A2:F2')
ws['A2'] = '=PARAMETRES!$B$6'
style(ws, 'A2:F2', F(7.5, color=GRIS), align=R_)

ws.merge_cells('A3:C3'); ws.merge_cells('D3:F3')
ws['A3'] = 'Qualité, rapidité et confiance'
style(ws, 'A3', F(8, color=GRIS2, i=True), align=L)
ws['D3'] = '="Réf. "&PARAMETRES!$B$7'
style(ws, 'D3', F(7.5, color=GRIS), align=R_)

ws.merge_cells('A4:F4')
style(ws, 'A4:F4', bg=ROUGE)

# ---------------------------------------------------------------- titre du document
ws.merge_cells('A5:F5')
ws['A5'] = '=UPPER($I$3)'
style(ws, 'A5:F5', F(14, True, BLANC), bg=NOIR, align=C_)

# ---------------------------------------------------------------- bloc document
def label(ref, texte):
    ws[ref.split(':')[0]] = texte
    style(ws, ref, F(8, True, BLANC), bg=ROUGE, align=Alignment(horizontal='left', vertical='center', indent=1), border=box)

def champ(ref, valeur, saisie=False, align=None, fmt=None):
    ws[ref.split(':')[0]] = valeur
    style(ws, ref, F(9), bg=(CLAIR if saisie else BLANC),
          align=align or Alignment(horizontal='left', vertical='center', indent=1),
          border=box, fmt=fmt)

for rng in ('A7:B7', 'C7:D7', 'A8:B8', 'C8:D8', 'A9:F9',
            'A10:B10', 'C10:F10', 'A11:B11', 'C11:D11',
            'A12:B12', 'C12:F12'):
    ws.merge_cells(rng)

label('A7:B7', 'N° Document')
champ('C7:D7',
      '=IF($I$3="FACTURE",PARAMETRES!$B$11,PARAMETRES!$B$12)&"-"&PARAMETRES!$B$10&"-"'
      '&TEXT(COUNTIF(\'HISTORIQUE DOCS\'!$C$4:$C$1000,$I$3)+1,"000")')
style(ws, 'C7', F(9, True))
label('E7', 'Date')
champ('F7', __import__('datetime').datetime(2026, 9, 1), saisie=True, align=C_, fmt=DATE)

label('A8:B8', 'ID Client')
champ('C8:D8', 'CLI-0003', saisie=True)
label('E8', 'Lieu')
champ('F8', 'Lubumbashi', saisie=True, align=C_)

ws['A9'] = 'CLIENT'
style(ws, 'A9:F9', F(9, True, BLANC), bg=GRIS2,
      align=Alignment(horizontal='left', vertical='center', indent=1))

CLI = "'BASE CLIENTS'!$A$4:$M$500"
label('A10:B10', 'Nom / Société')
champ('C10:F10',
      f'=IFERROR(TRIM(VLOOKUP($C$8,{CLI},4,FALSE)&" "&VLOOKUP($C$8,{CLI},3,FALSE)&" "'
      f'&VLOOKUP($C$8,{CLI},2,FALSE))&IF(VLOOKUP($C$8,{CLI},5,FALSE)="","", " — "'
      f'&VLOOKUP($C$8,{CLI},5,FALSE)),"")')
style(ws, 'C10', F(9, True))

label('A11:B11', 'Téléphone')
champ('C11:D11', f'=IFERROR(VLOOKUP($C$8,{CLI},6,FALSE),"")')
label('E11', 'Ville')
champ('F11', f'=IFERROR(VLOOKUP($C$8,{CLI},8,FALSE),"")', align=C_)

label('A12:B12', 'Adresse')
champ('C12:F12',
      f'=IFERROR(TRIM(VLOOKUP($C$8,{CLI},10,FALSE)&" "&VLOOKUP($C$8,{CLI},9,FALSE)),"")')

# ---------------------------------------------------------------- tableau articles
entetes = [('A14', 'N°'), ('B14', 'Réf.'), ('C14', 'Désignation'),
           ('D14', 'Qté'), ('E14', 'P.U. USD'), ('F14', 'Montant')]
for ref, txt in entetes:
    ws[ref] = txt
style(ws, 'A14:F14', F(9, True, BLANC), bg=NOIR, align=CW, border=box)

ART = "'BASE ARTICLES'!$A$4:$P$500"
for i, r in enumerate(range(PREM_LIGNE, DERN_LIGNE + 1), start=1):
    ws[f'A{r}'] = i
    ws[f'B{r}'] = None
    ws[f'C{r}'] = f'=IFERROR(VLOOKUP($B{r},{ART},2,FALSE),"")'
    ws[f'D{r}'] = None
    ws[f'E{r}'] = f'=IFERROR(VLOOKUP($B{r},{ART},10,FALSE),"")'
    ws[f'F{r}'] = f'=IF(OR($B{r}="",$D{r}=""),0,$D{r}*$E{r}+$H{r}+$I{r})'
    # zone de travail (hors impression)
    ws[f'H{r}'] = 0
    ws[f'I{r}'] = 0
    ws[f'J{r}'] = f'=IFERROR(VLOOKUP($B{r},{ART},13,FALSE),"")'
    ws[f'K{r}'] = f'=IFERROR(VLOOKUP($B{r},{ART},9,FALSE),$I$5)'
    ws[f'L{r}'] = (f'=IF(OR($B{r}="",$D{r}=""),"",IF(N($J{r})<N($D{r}),'
                   f'"STOCK INSUFFISANT","OK"))')

style(ws, f'A{PREM_LIGNE}:F{DERN_LIGNE}', F(9), bg=BLANC, align=L, border=box)
style(ws, f'A{PREM_LIGNE}:A{DERN_LIGNE}', align=C_)
style(ws, f'B{PREM_LIGNE}:B{DERN_LIGNE}', bg=CLAIR, align=C_)
style(ws, f'D{PREM_LIGNE}:D{DERN_LIGNE}', bg=CLAIR, align=C_)
style(ws, f'E{PREM_LIGNE}:F{DERN_LIGNE}', align=R_, fmt=USD)

# ---------------------------------------------------------------- totaux + observations
ws.merge_cells('A25:C25'); ws.merge_cells('A26:C27')
ws.merge_cells('D25:E25'); ws.merge_cells('D26:E26'); ws.merge_cells('D27:E27')
ws.merge_cells('A28:B28'); ws.merge_cells('C28:F28')

ws['A25'] = 'OBSERVATIONS'
style(ws, 'A25:C25', F(8, True, BLANC), bg=GRIS2,
      align=Alignment(horizontal='left', vertical='center', indent=1))
ws['A26'] = 'Saisir ici les observations, garanties ou conditions particulières.'
style(ws, 'A26:C27', F(8, color=GRIS), bg=CLAIR, align=LW, border=box)

ws['D25'] = 'Sous-total'
ws['F25'] = f'=SUM(F{PREM_LIGNE}:F{DERN_LIGNE})'
ws['D26'] = 'Marge société'
ws['F26'] = f'=SUMPRODUCT(F{PREM_LIGNE}:F{DERN_LIGNE},K{PREM_LIGNE}:K{DERN_LIGNE})'
ws['D27'] = 'TOTAL GÉNÉRAL'
ws['F27'] = '=F25+F26'

style(ws, 'D25:E26', F(9, True), bg=CLAIR,
      align=Alignment(horizontal='right', vertical='center', indent=1), border=box)
style(ws, 'F25:F26', F(9), bg=BLANC, align=R_, border=box, fmt=USD)
style(ws, 'D27:E27', F(10, True, BLANC), bg=ROUGE,
      align=Alignment(horizontal='right', vertical='center', indent=1), border=box)
style(ws, 'F27', F(10, True, BLANC), bg=ROUGE, align=R_, border=box, fmt=USD)

ws['A28'] = 'Conditions paiement'
style(ws, 'A28:B28', F(8, True, BLANC), bg=ROUGE,
      align=Alignment(horizontal='center', vertical='center'), border=box)
ws['C28'] = '=PARAMETRES!$B$15'
style(ws, 'C28:F28', F(9), bg=BLANC,
      align=Alignment(horizontal='left', vertical='center', indent=1), border=box)

# ---------------------------------------------------------------- signatures
ws.merge_cells('A30:C32'); ws.merge_cells('D30:F32')
ws['A30'] = '="Pour "&PARAMETRES!$B$4&CHAR(10)&CHAR(10)&"Signature & cachet"'
ws['D30'] = '="Client : "&$C$10&CHAR(10)&CHAR(10)&"Signature"'
style(ws, 'A30:F32', F(8, True), bg=BLANC, align=LW, border=box)

# ---------------------------------------------------------------- pied de page
ws.merge_cells('A34:F34')
ws['A34'] = ('=IF($I$3="PROFORMA","Proforma valable "&PARAMETRES!$B$16&" jours — ne vaut '
             'pas facture et n’entraîne aucune sortie de stock.","Merci de votre confiance — '
             'toute réclamation doit être formulée dans les 7 jours.")')
style(ws, 'A34:F34', F(7, color=GRIS2), bg=NOTE_BG, align=C_)

# ---------------------------------------------------------------- zone interne (H:L)
ws.merge_cells('H1:L1')
ws['H1'] = 'ZONE DE TRAVAIL — COLONNES G À L NON IMPRIMÉES'
style(ws, 'H1:L1', F(9, True, BLANC), bg=NOIR, align=C_)

interne = [('H3', 'TYPE DOCUMENT', 'I3', 'FACTURE', 'General'),
           ('H4', 'STATUT',        'I4', 'BROUILLON', 'General'),
           ('H5', 'Marge % défaut','I5', 0.3, PCT),
           ('H6', 'Devise',        'I6', '=PARAMETRES!$B$8', 'General'),
           ('H7', 'Année',         'I7', '=PARAMETRES!$B$10', '0')]
for lab_ref, lab_txt, val_ref, val, fmt in interne:
    ws[lab_ref] = lab_txt
    style(ws, lab_ref, F(9, True, BLANC), bg=ROUGE,
          align=Alignment(horizontal='left', vertical='center', indent=1), border=box)
    ws[val_ref] = val
    style(ws, val_ref, F(9, True), bg=CLAIR, align=C_, border=box, fmt=fmt)

ws['H9'] = 'Contrôle stock'
style(ws, 'H9', F(9, True, BLANC), bg=ROUGE,
      align=Alignment(horizontal='left', vertical='center', indent=1), border=box)
ws.merge_cells('I9:J9')
ws['I9'] = (f'=IF(COUNTIF(L{PREM_LIGNE}:L{DERN_LIGNE},"STOCK INSUFFISANT")>0,'
            f'"⚠ "&COUNTIF(L{PREM_LIGNE}:L{DERN_LIGNE},"STOCK INSUFFISANT")&'
            f' " ligne(s) au-dessus du stock","OK — stock suffisant")')
style(ws, 'I9:J9', F(9, True), bg=CLAIR, align=C_, border=box)

ws['H11'] = 'Nb lignes remplies'
style(ws, 'H11', F(9, True, BLANC), bg=ROUGE,
      align=Alignment(horizontal='left', vertical='center', indent=1), border=box)
ws['I11'] = f'=COUNTA(B{PREM_LIGNE}:B{DERN_LIGNE})'
style(ws, 'I11', F(9, True), bg=CLAIR, align=C_, border=box, fmt='0')

ws.merge_cells('H12:L12')
ws['H12'] = ('Cellules à fond gris clair = saisie. Toutes les autres cellules '
             '(formules) sont verrouillées.')
style(ws, 'H12:L12', F(8, i=True, color=GRIS), bg=NOTE_BG, align=C_, border=box)

for ref, txt in (('H14', 'Transport'), ('I14', 'Autres frais'), ('J14', 'Stock dispo'),
                 ('K14', 'Marge %'), ('L14', 'Alerte stock')):
    ws[ref] = txt
style(ws, 'H14:L14', F(9, True, BLANC), bg=GRIS2, align=CW, border=box)
style(ws, f'H{PREM_LIGNE}:L{DERN_LIGNE}', F(9), bg=BLANC, align=C_, border=box)
style(ws, f'H{PREM_LIGNE}:I{DERN_LIGNE}', bg=CLAIR, align=R_, fmt=USD)
style(ws, f'J{PREM_LIGNE}:J{DERN_LIGNE}', fmt='0')
style(ws, f'K{PREM_LIGNE}:K{DERN_LIGNE}', fmt=PCT)

boutons = [('H26:L27', '✅ VALIDER & IMPRIMER — PDF A5 + Historique + Sortie de stock', NOIR),
           ('H28:L29', '🧾 ENREGISTRER BROUILLON — sans sortie de stock', GRIS2),
           ('H30:L31', '🧹 NOUVEAU DOCUMENT — formulaire vierge', GRIS)]
for rng, txt, couleur in boutons:
    ws.merge_cells(rng)
    ws[rng.split(':')[0]] = txt
    style(ws, rng, F(9, True, BLANC), bg=couleur, align=CW, border=box)

ws.merge_cells('H33:L36')
ws['H33'] = ('MAQUETTE — Dans la version finale automatisée, « VALIDER & IMPRIMER » génère le '
             'PDF au format A5, enregistre le document dans HISTORIQUE DOCS, met à jour le stock '
             'uniquement pour une FACTURE VALIDÉE, puis remet le formulaire à zéro. '
             'Une PROFORMA ne diminue jamais le stock. '
             'Les colonnes G à L ne sont pas imprimées : elles servent au calcul '
             '(transport, autres frais, stock, marge).')
style(ws, 'H33:L36', F(8, color=NOTE_FG), bg=NOTE_BG, align=LW, border=box)

# ---------------------------------------------------------------- validations
dv_type = DataValidation(type='list', formula1='"FACTURE,PROFORMA"', allow_blank=False)
dv_stat = DataValidation(type='list', formula1='"BROUILLON,VALIDÉ,ANNULÉ"', allow_blank=False)
dv_cli  = DataValidation(type='list', formula1="'BASE CLIENTS'!$A$4:$A$500", allow_blank=True)
dv_art  = DataValidation(type='list', formula1="'BASE ARTICLES'!$A$4:$A$500", allow_blank=True)
dv_qte  = DataValidation(type='whole', operator='greaterThanOrEqual', formula1='0',
                         allow_blank=True, error='Quantité : nombre entier positif.',
                         errorTitle='Quantité invalide')
for dv in (dv_type, dv_stat, dv_cli, dv_art, dv_qte):
    ws.add_data_validation(dv)
dv_type.add('I3'); dv_stat.add('I4'); dv_cli.add('C8')
dv_art.add(f'B{PREM_LIGNE}:B{DERN_LIGNE}')
dv_qte.add(f'D{PREM_LIGNE}:D{DERN_LIGNE}')

# quantité > stock disponible -> ligne signalée
ws.conditional_formatting.add(
    f'A{PREM_LIGNE}:F{DERN_LIGNE}',
    FormulaRule(formula=[f'AND($B{PREM_LIGNE}<>"",$D{PREM_LIGNE}<>"",N($J{PREM_LIGNE})<N($D{PREM_LIGNE}))'],
                fill=fill('FDE2E2'), font=Font(name=FONT, size=9, color='9B1C1C', bold=True),
                stopIfTrue=False))
ws.conditional_formatting.add(
    f'L{PREM_LIGNE}:L{DERN_LIGNE}',
    CellIsRule(operator='equal', formula=['"STOCK INSUFFISANT"'],
               fill=fill('FDE2E2'), font=Font(name=FONT, size=9, color='9B1C1C', bold=True)))

# ---------------------------------------------------------------- mise en page A5
ws.print_area = 'A1:F34'
ws.page_setup.paperSize = 11              # 11 = A5
ws.page_setup.orientation = 'portrait'
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 1
ws.page_setup.horizontalDpi = 600
ws.page_setup.verticalDpi = 600
ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True, autoPageBreaks=True)
ws.page_margins.left = 0.24
ws.page_margins.right = 0.24
ws.page_margins.top = 0.28
ws.page_margins.bottom = 0.28
ws.page_margins.header = 0.0
ws.page_margins.footer = 0.0
ws.print_options.horizontalCentered = True
ws.sheet_properties.tabColor = 'FF' + ROUGE

# ============================================================================
# 3. Les autres onglets : figeage, filtre, mise en page A4 paysage
# ============================================================================
def mise_en_page(ws, paysage=True, titres='1:3', fitw=1):
    ws.page_setup.paperSize = 9            # 9 = A4
    ws.page_setup.orientation = 'landscape' if paysage else 'portrait'
    ws.page_setup.fitToWidth = fitw
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_margins.left = ws.page_margins.right = 0.3
    ws.page_margins.top = ws.page_margins.bottom = 0.4
    if titres:
        ws.print_title_rows = titres
    ws.oddFooter.right.text = "Page &P / &N"
    ws.oddFooter.right.size = 8
    ws.oddFooter.left.text = "KATANGA TECHCARE"
    ws.oddFooter.left.size = 8

tableaux = {
    'BASE CLIENTS':    ('A3:M500',  'A4'),
    'BASE ARTICLES':   ('A3:P500',  'A4'),
    'ENTREES STOCK':   ('D3:L500',  'D4'),
    'HISTORIQUE DOCS': ('A3:P1000', 'A4'),
    'JOURNAL STOCK':   ('A3:J500',  'A4'),
}
for nom, (ref, gel) in tableaux.items():
    s = wb[nom]
    s.auto_filter.ref = ref
    s.freeze_panes = gel
    mise_en_page(s)
    s.sheet_view.showGridLines = False

mise_en_page(wb['TABLEAU DE BORD'], paysage=True, titres=None)
wb['TABLEAU DE BORD'].print_area = 'A1:H8'
wb['TABLEAU DE BORD'].sheet_view.showGridLines = False
mise_en_page(par, paysage=False, titres=None)
par.print_area = 'A1:B18'
par.sheet_view.showGridLines = False

# formats manquants
ba = wb['BASE ARTICLES']
for r in range(4, 501):
    for col in ('K', 'L', 'M', 'N'):
        ba[f'{col}{r}'].number_format = '0'
je = wb['ENTREES STOCK']
for r in range(4, 501):
    for col in ('K', 'L'):
        je[f'{col}{r}'].number_format = USD
    je[f'I{r}'].number_format = '0'

# tableau de bord : indicateurs plus robustes
tb = wb['TABLEAU DE BORD']
tb['B8'] = ("=SUMPRODUCT(--('BASE ARTICLES'!A4:A500<>\"\"),"
            "--('BASE ARTICLES'!M4:M500<='BASE ARTICLES'!N4:N500))")
tb['E8'] = ("=COUNTIFS('HISTORIQUE DOCS'!A4:A1000,\">=\"&DATE(YEAR(TODAY()),MONTH(TODAY()),1),"
            "'HISTORIQUE DOCS'!A4:A1000,\"<\"&DATE(YEAR(TODAY()),MONTH(TODAY())+1,1),"
            "'HISTORIQUE DOCS'!C4:C1000,\"FACTURE\")")

# couleurs d'onglets
for nom, couleur in (('BASE CLIENTS', GRIS2), ('BASE ARTICLES', GRIS2),
                     ('ENTREES STOCK', GRIS2), ('HISTORIQUE DOCS', NOIR),
                     ('JOURNAL STOCK', NOIR), ('TABLEAU DE BORD', ROUGE),
                     ('PARAMETRES', GRIS)):
    wb[nom].sheet_properties.tabColor = 'FF' + couleur

# ============================================================================
# 4. Verrouillage : on ferme toutes les cellules de formule,
#    seules les cellules de saisie (fond gris clair) restent modifiables.
# ============================================================================
def proteger(ws):
    ws.protection.sheet = True
    # aucun mot de passe : Révision > Ôter la protection de la feuille
    ws.protection.selectLockedCells = False   # les cellules verrouillées restent sélectionnables
    ws.protection.selectUnlockedCells = False
    ws.protection.formatCells = False
    ws.protection.formatColumns = False
    ws.protection.formatRows = False
    ws.protection.sort = False
    ws.protection.autoFilter = False
    ws.protection.insertRows = True
    ws.protection.deleteRows = True

# --- FACTURE-PROFORMA : saisie = type/statut/marge, date, lieu, client,
#     réf. article, quantité, transport, autres frais, observations
deverrouiller(ws, 'I3', 'I4', 'I5', 'F7', 'F8', 'C8:D8', 'A26:C27',
              f'B{PREM_LIGNE}:B{DERN_LIGNE}',
              f'D{PREM_LIGNE}:D{DERN_LIGNE}',
              f'H{PREM_LIGNE}:I{DERN_LIGNE}')
proteger(ws)

# --- autres onglets : on n'ouvre que les colonnes de saisie
saisies = {
    'BASE CLIENTS':    ['A4:M500', 'P4:P12'],
    'BASE ARTICLES':   ['A4:G500', 'I4:I500', 'K4:K500', 'N4:P500', 'S4:S13'],
    'ENTREES STOCK':   ['B4:B11', 'D4:L500'],
    'HISTORIQUE DOCS': ['A4:L1000', 'P4:P1000'],
    'JOURNAL STOCK':   ['A4:J500'],
    'TABLEAU DE BORD': ['H4:H7'],
    'PARAMETRES':      ['B4:B18'],
}
for nom, refs in saisies.items():
    s_ws = wb[nom]
    deverrouiller(s_ws, *refs)
    proteger(s_ws)

wb.active = 0
wb.save(OUT)
print('OK ->', OUT)
