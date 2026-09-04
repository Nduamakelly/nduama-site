Attribute VB_Name = "mdlOutils"
Option Explicit

' =====================================================================
'  KATANGA TECHCARE — Outils communs
'  Constantes, protection des feuilles et fonctions partagées.
' =====================================================================

' ---- noms des feuilles ------------------------------------------------
Public Const FEUILLE_DOC As String = "FACTURE-PROFORMA"
Public Const FEUILLE_CLIENTS As String = "BASE CLIENTS"
Public Const FEUILLE_ARTICLES As String = "BASE ARTICLES"
Public Const FEUILLE_ENTREES As String = "ENTREES STOCK"
Public Const FEUILLE_HISTO As String = "HISTORIQUE DOCS"
Public Const FEUILLE_JOURNAL As String = "JOURNAL STOCK"
Public Const FEUILLE_PARAM As String = "PARAMETRES"

' ---- repères de lignes ------------------------------------------------
Public Const LIGNE_ART_DEB As Long = 15      ' 1re ligne d'article du document
Public Const LIGNE_ART_FIN As Long = 24      ' dernière ligne d'article
Public Const LIGNE_DATA As Long = 4          ' 1re ligne de données des tableaux
Public Const DERNIERE_HISTO As Long = 1000   ' étendue des formules M:O de l'historique

' ---- protection --------------------------------------------------------
' Aucun mot de passe n'est posé sur les feuilles. Si vous en ajoutez un
' dans Excel, reportez-le ici pour que les macros continuent de fonctionner.
Public Const MDP_FEUILLE As String = ""

Public Const TITRE As String = "KATANGA TECHCARE"


' Enlève la protection d'une feuille (sans erreur si elle ne l'est pas).
Public Sub Deverrouiller(ws As Worksheet)
    On Error Resume Next
    ws.Unprotect MDP_FEUILLE
    On Error GoTo 0
End Sub


' Repose la protection : formules fermées, cellules de saisie ouvertes,
' boutons cliquables, tri et filtre autorisés.
Public Sub Verrouiller(ws As Worksheet)
    On Error Resume Next
    ws.Protect Password:=MDP_FEUILLE, DrawingObjects:=False, Contents:=True, _
               Scenarios:=False, AllowFormattingCells:=True, _
               AllowFormattingColumns:=True, AllowFormattingRows:=True, _
               AllowSorting:=True, AllowFiltering:=True
    On Error GoTo 0
End Sub


' Valeur d'un paramètre de l'onglet PARAMETRES (colonne B).
' Évite d'écrire en dur dans le code les libellés accentués comme VALIDÉ.
Public Function Parametre(ligne As Long) As String
    Parametre = Trim$(CStr(ThisWorkbook.Worksheets(FEUILLE_PARAM).Cells(ligne, "B").Value))
End Function


' Statut d'un document validé, lu dans PARAMETRES (B13 facture / B14 proforma).
Public Function StatutValide(typeDoc As String) As String
    If UCase$(typeDoc) = "FACTURE" Then
        StatutValide = Parametre(13)
    Else
        StatutValide = Parametre(14)
    End If
    If StatutValide = "" Then StatutValide = "VALID" & ChrW(201)   ' VALIDÉ
End Function


' Première ligne libre d'un tableau, d'après une colonne sans formule.
Public Function ProchaineLigne(ws As Worksheet, colonne As String) As Long
    Dim r As Long
    r = ws.Cells(ws.Rows.Count, colonne).End(xlUp).Row
    If r < LIGNE_DATA Then
        ProchaineLigne = LIGNE_DATA
    Else
        ProchaineLigne = r + 1
    End If
End Function


' Prochain identifiant du type CLI-0005 / ART-0007 / ENT-0012.
' On repart du plus grand numéro existant : pas de doublon après suppression.
Public Function ProchainId(prefixe As String, ws As Worksheet, colonne As String) As String
    Dim i As Long, derniere As Long, maxNum As Long
    Dim suffixe As String, v As String

    derniere = ProchaineLigne(ws, colonne) - 1
    For i = LIGNE_DATA To derniere
        v = Trim$(CStr(ws.Cells(i, colonne).Value))
        If UCase$(Left$(v, Len(prefixe))) = UCase$(prefixe) Then
            suffixe = Mid$(v, Len(prefixe) + 1)
            If IsNumeric(suffixe) Then
                If CLng(suffixe) > maxNum Then maxNum = CLng(suffixe)
            End If
        End If
    Next i

    ProchainId = prefixe & Format$(maxNum + 1, "0000")
End Function


' Recherche dans BASE ARTICLES à partir de la référence.
' colonne : 2 = Désignation, 8 = Coût de revient, 10 = Prix de vente,
'          13 = Stock disponible, 14 = Seuil d'alerte
Public Function InfoArticle(reference As String, colonne As Long) As Variant
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(FEUILLE_ARTICLES)
    On Error Resume Next
    InfoArticle = Application.WorksheetFunction.VLookup( _
                     reference, ws.Range("A" & LIGNE_DATA & ":P500"), colonne, False)
    If Err.Number <> 0 Then InfoArticle = ""
    On Error GoTo 0
End Function


' Ligne d'un article dans BASE ARTICLES (0 si la référence n'existe pas).
Public Function LigneArticle(reference As String) As Long
    Dim ws As Worksheet, trouve As Range
    Set ws = ThisWorkbook.Worksheets(FEUILLE_ARTICLES)
    Set trouve = ws.Range("A" & LIGNE_DATA & ":A500").Find( _
                    What:=reference, LookIn:=xlValues, LookAt:=xlWhole)
    If trouve Is Nothing Then
        LigneArticle = 0
    Else
        LigneArticle = trouve.Row
    End If
End Function


' Remet les formules de calcul de l'historique : une suppression de lignes
' raccourcit le bloc M:O par le bas, on le reconstruit.
Public Sub RestaurerFormulesHistorique()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(FEUILLE_HISTO)

    Deverrouiller ws
    ws.Range("M" & LIGNE_DATA & ":M" & DERNIERE_HISTO).Formula = "=H4*I4+J4+K4"
    ws.Range("N" & LIGNE_DATA & ":N" & DERNIERE_HISTO).Formula = "=M4*L4"
    ws.Range("O" & LIGNE_DATA & ":O" & DERNIERE_HISTO).Formula = "=M4+N4"
    Verrouiller ws
End Sub


' Écrit une valeur dans une cellule, qu'elle soit fusionnée ou non.
' Excel refuse toute écriture qui ne couvre pas la totalité d'une fusion :
' on vise donc systématiquement la zone fusionnée complète.
Public Sub EcrireCellule(ws As Worksheet, adresse As String, valeur As Variant)
    Dim c As Range
    Set c = ws.Range(adresse)
    If c.MergeCells Then
        c.MergeArea.Cells(1, 1).Value = valeur
    Else
        c.Value = valeur
    End If
End Sub


' Vide une cellule, qu'elle soit fusionnée ou non.
Public Sub ViderCellule(ws As Worksheet, adresse As String)
    Dim c As Range
    Set c = ws.Range(adresse)
    If c.MergeCells Then
        c.MergeArea.ClearContents
    Else
        c.ClearContents
    End If
End Sub


Public Sub Alerte(message As String)
    MsgBox message, vbExclamation, TITRE
End Sub


Public Sub Info(message As String)
    MsgBox message, vbInformation, TITRE
End Sub
