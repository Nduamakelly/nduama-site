# -*- coding: utf-8 -*-
"""Ajoute les boutons cliquables (formes liées à une macro) et produit le .xlsm.

Les formes sont posées exactement sur les cellules « bouton » de la maquette,
toutes situées hors zone d'impression. Chaque forme porte l'attribut `macro`
qui appelle la procédure VBA correspondante.
"""
import re
import shutil
import zipfile

SOURCE = '/home/user/nduama-site/outils/Maquette_Katanga_Techcare_V3_Facturation_Stock.xlsx'
CIBLE = '/home/user/nduama-site/outils/Maquette_Katanga_Techcare_V3_Facturation_Stock.xlsm'

NS_XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'
NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

# feuille -> liste de boutons (col/ligne de départ et de fin en index 0,
# fin exclue ; couleur de fond ; libellé ; macro)
BOUTONS = {
    'xl/worksheets/sheet1.xml': [   # FACTURE-PROFORMA
        dict(de=(7, 25), a=(12, 27), fond='111111',
             texte='✅  VALIDER & IMPRIMER\nPDF A5 + Historique + Sortie de stock',
             macro='ValiderEtImprimer'),
        dict(de=(7, 27), a=(12, 30), fond='6B7280',
             texte='🧾  ENREGISTRER BROUILLON\nSans sortie de stock',
             macro='EnregistrerBrouillon'),
        dict(de=(7, 30), a=(12, 32), fond='4B5563',
             texte='🧹  NOUVEAU DOCUMENT\nFormulaire vierge',
             macro='NouveauDocument'),
    ],
    'xl/worksheets/sheet2.xml': [   # BASE CLIENTS
        dict(de=(14, 13), a=(16, 15), fond='D71920',
             texte='➕  AJOUTER CLIENT', macro='AjouterClient'),
    ],
    'xl/worksheets/sheet3.xml': [   # BASE ARTICLES
        dict(de=(17, 14), a=(19, 16), fond='D71920',
             texte='➕  ENREGISTRER ARTICLE', macro='EnregistrerArticle'),
    ],
    'xl/worksheets/sheet4.xml': [   # ENTREES STOCK
        dict(de=(0, 12), a=(2, 14), fond='D71920',
             texte='✅  VALIDER L’ENTRÉE STOCK', macro='ValiderEntreeStock'),
    ],
}


def echapper(txt):
    return (txt.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def paragraphes(texte):
    """Un <a:p> par ligne ; la première ligne est en gras et plus grande."""
    sortie = []
    for i, ligne in enumerate(texte.split('\n')):
        taille = 900 if i == 0 else 700
        gras = 1 if i == 0 else 0
        sortie.append(
            f'<a:p><a:pPr algn="ctr"/><a:r>'
            f'<a:rPr lang="fr-FR" sz="{taille}" b="{gras}">'
            f'<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>'
            f'<a:latin typeface="Calibri"/></a:rPr>'
            f'<a:t>{echapper(ligne)}</a:t></a:r></a:p>')
    return ''.join(sortie)


def forme(index, bouton):
    dc, dl = bouton['de']
    ac, al = bouton['a']
    return (
        '<xdr:twoCellAnchor editAs="oneCell">'
        f'<xdr:from><xdr:col>{dc}</xdr:col><xdr:colOff>19050</xdr:colOff>'
        f'<xdr:row>{dl}</xdr:row><xdr:rowOff>19050</xdr:rowOff></xdr:from>'
        f'<xdr:to><xdr:col>{ac}</xdr:col><xdr:colOff>0</xdr:colOff>'
        f'<xdr:row>{al}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>'
        f'<xdr:sp macro="[0]!{bouton["macro"]}" textlink="">'
        '<xdr:nvSpPr>'
        f'<xdr:cNvPr id="{index}" name="btn{bouton["macro"]}"/>'
        '<xdr:cNvSpPr/></xdr:nvSpPr>'
        '<xdr:spPr>'
        '<a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm>'
        '<a:prstGeom prst="roundRect"><a:avLst>'
        '<a:gd name="adj" fmla="val 14000"/></a:avLst></a:prstGeom>'
        f'<a:solidFill><a:srgbClr val="{bouton["fond"]}"/></a:solidFill>'
        f'<a:ln w="9525"><a:solidFill><a:srgbClr val="{bouton["fond"]}"/></a:solidFill></a:ln>'
        '</xdr:spPr>'
        '<xdr:txBody>'
        '<a:bodyPr vertOverflow="clip" horzOverflow="clip" wrap="square" '
        'lIns="45720" tIns="27432" rIns="45720" bIns="27432" anchor="ctr"/>'
        '<a:lstStyle/>'
        f'{paragraphes(bouton["texte"])}'
        '</xdr:txBody></xdr:sp>'
        '<xdr:clientData fLocksWithSheet="0"/>'
        '</xdr:twoCellAnchor>')


def dessin(boutons):
    formes = ''.join(forme(i + 2, b) for i, b in enumerate(boutons))
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<xdr:wsDr xmlns:xdr="{NS_XDR}" xmlns:a="{NS_A}">{formes}</xdr:wsDr>')


def brancher_dessin(xml_feuille, r_id):
    """Insère <drawing/> à sa place (après pageSetup) et déclare le namespace r."""
    if 'xmlns:r=' not in xml_feuille:
        xml_feuille = xml_feuille.replace(
            '<worksheet xmlns=', f'<worksheet xmlns:r="{NS_R}" xmlns=', 1)

    balise = f'<drawing r:id="{r_id}"/>'
    # <drawing> se place après pageSetup / headerFooter, juste avant </worksheet>
    assert '<drawing ' not in xml_feuille
    return xml_feuille.replace('</worksheet>', balise + '</worksheet>', 1)


def construire():
    src = zipfile.ZipFile(SOURCE)
    noms = src.namelist()
    parts = {n: src.read(n) for n in noms}
    src.close()

    numero_dessin = 0
    for feuille, boutons in BOUTONS.items():
        numero_dessin += 1
        chemin_dessin = f'xl/drawings/drawing{numero_dessin}.xml'
        parts[chemin_dessin] = dessin(boutons).encode('utf-8')

        # relation feuille -> dessin
        rels = f'xl/worksheets/_rels/{feuille.split("/")[-1]}.rels'
        parts[rels] = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'<Relationship Id="rIdDrawing" Type="{NS_R}/drawing" '
            f'Target="../drawings/drawing{numero_dessin}.xml"/>'
            '</Relationships>').encode('utf-8')

        parts[feuille] = brancher_dessin(
            parts[feuille].decode('utf-8'), 'rIdDrawing').encode('utf-8')

    # types de contenu : dessins + classeur prenant en charge les macros
    ct = parts['[Content_Types].xml'].decode('utf-8')
    ajouts = ''.join(
        f'<Override PartName="/xl/drawings/drawing{i + 1}.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
        for i in range(len(BOUTONS)))
    ct = ct.replace('</Types>', ajouts + '</Types>')
    ct = ct.replace(
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"',
        'ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"')
    parts['[Content_Types].xml'] = ct.encode('utf-8')

    with zipfile.ZipFile(CIBLE, 'w', zipfile.ZIP_DEFLATED) as out:
        for nom, contenu in parts.items():
            out.writestr(nom, contenu)

    print('écrit :', CIBLE)
    print('boutons :', sum(len(b) for b in BOUTONS.values()))


if __name__ == '__main__':
    construire()
