Attribute VB_Name = "mdlFacturation"
Option Explicit

' =====================================================================
'  KATANGA TECHCARE — Facturation / Proforma
'
'  Une macro par bouton de l'onglet FACTURE-PROFORMA :
'    ValiderEtImprimer    -> historique + stock + PDF A5 + remise à zéro
'    EnregistrerBrouillon -> historique en BROUILLON, sans sortie de stock
'    NouveauDocument      -> formulaire vierge
' =====================================================================


' ---------------------------------------------------------------------
'  BOUTON 1 : VALIDER & IMPRIMER
' ---------------------------------------------------------------------
Public Sub ValiderEtImprimer()
    EnregistrerDocument True
End Sub


' ---------------------------------------------------------------------
'  BOUTON 2 : ENREGISTRER BROUILLON
' ---------------------------------------------------------------------
Public Sub EnregistrerBrouillon()
    EnregistrerDocument False
End Sub


' ---------------------------------------------------------------------
'  BOUTON 3 : NOUVEAU DOCUMENT
' ---------------------------------------------------------------------
Public Sub NouveauDocument()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(FEUILLE_DOC)

    If MsgBox("Vider le formulaire et commencer un nouveau document ?", _
              vbYesNo + vbQuestion, TITRE) <> vbYes Then Exit Sub

    ViderFormulaire
    ws.Activate
    ws.Range("C8").Select
End Sub


' =====================================================================
'  Traitement commun aux boutons 1 et 2
' =====================================================================
Private Sub EnregistrerDocument(valide As Boolean)
    Dim wsD As Worksheet, wsH As Worksheet, wsJ As Worksheet
    Dim i As Long, ligne As Long, nbLignes As Long
    Dim typeDoc As String, numDoc As String, statut As String
    Dim reference As String, nomClient As String
    Dim qte As Double, stockDispo As Double
    Dim fichierPDF As String

    Set wsD = ThisWorkbook.Worksheets(FEUILLE_DOC)
    Set wsH = ThisWorkbook.Worksheets(FEUILLE_HISTO)
    Set wsJ = ThisWorkbook.Worksheets(FEUILLE_JOURNAL)

    Application.Calculate

    ' ---------- contrôles de saisie ------------------------------------
    typeDoc = UCase$(Trim$(CStr(wsD.Range("I3").Value)))
    If typeDoc <> "FACTURE" And typeDoc <> "PROFORMA" Then
        Alerte "Choisissez le type de document (FACTURE ou PROFORMA) en I3."
        Exit Sub
    End If

    If Trim$(CStr(wsD.Range("C8").Value)) = "" Then
        Alerte "Sélectionnez un client en C8 (ID Client)."
        Exit Sub
    End If

    nomClient = Trim$(CStr(wsD.Range("C10").Value))
    If nomClient = "" Then
        Alerte "L'ID client saisi en C8 n'existe pas dans BASE CLIENTS."
        Exit Sub
    End If

    If Not IsDate(wsD.Range("F7").Value) Then
        Alerte "Saisissez une date valide en F7."
        Exit Sub
    End If

    nbLignes = 0
    For i = LIGNE_ART_DEB To LIGNE_ART_FIN
        reference = Trim$(CStr(wsD.Cells(i, "B").Value))
        If reference <> "" Then
            If LigneArticle(reference) = 0 Then
                Alerte "Ligne " & i & " : la référence " & reference & _
                       " n'existe pas dans BASE ARTICLES."
                Exit Sub
            End If
            qte = Val(CStr(wsD.Cells(i, "D").Value))
            If qte <= 0 Then
                Alerte "Ligne " & i & " : saisissez une quantité supérieure à zéro."
                Exit Sub
            End If
            nbLignes = nbLignes + 1
        End If
    Next i

    If nbLignes = 0 Then
        Alerte "Aucun article saisi : remplissez au moins une ligne (colonnes B et D)."
        Exit Sub
    End If

    ' ---------- contrôle du stock : facture validée uniquement ----------
    If valide And typeDoc = "FACTURE" Then
        For i = LIGNE_ART_DEB To LIGNE_ART_FIN
            reference = Trim$(CStr(wsD.Cells(i, "B").Value))
            If reference <> "" Then
                qte = Val(CStr(wsD.Cells(i, "D").Value))
                stockDispo = Val(CStr(wsD.Cells(i, "J").Value))
                If qte > stockDispo Then
                    Alerte "Stock insuffisant pour " & reference & " (ligne " & i & ")." & _
                           vbNewLine & "Demandé : " & qte & "    Disponible : " & stockDispo & _
                           vbNewLine & vbNewLine & _
                           "Enregistrez d'abord une entrée de stock, ou établissez une PROFORMA."
                    Exit Sub
                End If
            End If
        Next i
    End If

    numDoc = Trim$(CStr(wsD.Range("C7").Value))
    If valide Then
        statut = StatutValide(typeDoc)
    Else
        statut = "BROUILLON"
    End If

    ' ---------- confirmation ---------------------------------------------
    If valide Then
        If MsgBox("Valider " & typeDoc & " " & numDoc & " au nom de " & nomClient & _
                  ", total " & Format$(wsD.Range("F27").Value, "$#,##0.00") & " ?" & _
                  vbNewLine & vbNewLine & _
                  IIf(typeDoc = "FACTURE", _
                      "Le stock sera diminué et le PDF A5 sera généré.", _
                      "Aucune sortie de stock : le PDF A5 sera généré."), _
                  vbYesNo + vbQuestion, TITRE) <> vbYes Then Exit Sub
    End If

    Application.ScreenUpdating = False
    On Error GoTo Nettoyage

    ' ---------- on efface une éventuelle version précédente ---------------
    SupprimerLignesDocument numDoc

    ' ---------- écriture dans HISTORIQUE DOCS -----------------------------
    Deverrouiller wsH
    For i = LIGNE_ART_DEB To LIGNE_ART_FIN
        reference = Trim$(CStr(wsD.Cells(i, "B").Value))
        If reference <> "" Then
            ligne = ProchaineLigne(wsH, "B")
            wsH.Cells(ligne, "A").Value = wsD.Range("F7").Value
            wsH.Cells(ligne, "A").NumberFormat = "dd/mm/yyyy"
            wsH.Cells(ligne, "B").Value = numDoc
            wsH.Cells(ligne, "C").Value = typeDoc
            wsH.Cells(ligne, "D").Value = wsD.Range("C8").Value
            wsH.Cells(ligne, "E").Value = nomClient
            wsH.Cells(ligne, "F").Value = reference
            wsH.Cells(ligne, "G").Value = wsD.Cells(i, "C").Value
            wsH.Cells(ligne, "H").Value = Val(CStr(wsD.Cells(i, "D").Value))
            wsH.Cells(ligne, "I").Value = Val(CStr(wsD.Cells(i, "E").Value))
            wsH.Cells(ligne, "J").Value = Val(CStr(wsD.Cells(i, "H").Value))
            wsH.Cells(ligne, "K").Value = Val(CStr(wsD.Cells(i, "I").Value))
            wsH.Cells(ligne, "L").Value = Val(CStr(wsD.Cells(i, "K").Value))
            wsH.Cells(ligne, "P").Value = statut
        End If
    Next i
    Verrouiller wsH

    Application.Calculate

    ' ---------- journal de stock : facture validée uniquement -------------
    If valide And typeDoc = "FACTURE" Then
        Deverrouiller wsJ
        For i = LIGNE_ART_DEB To LIGNE_ART_FIN
            reference = Trim$(CStr(wsD.Cells(i, "B").Value))
            If reference <> "" Then
                ligne = ProchaineLigne(wsJ, "A")
                wsJ.Cells(ligne, "A").Value = wsD.Range("F7").Value
                wsJ.Cells(ligne, "A").NumberFormat = "dd/mm/yyyy"
                wsJ.Cells(ligne, "B").Value = "SORTIE"
                wsJ.Cells(ligne, "C").Value = reference
                wsJ.Cells(ligne, "D").Value = wsD.Cells(i, "C").Value
                wsJ.Cells(ligne, "E").Value = numDoc
                wsJ.Cells(ligne, "F").Value = 0
                wsJ.Cells(ligne, "G").Value = Val(CStr(wsD.Cells(i, "D").Value))
                wsJ.Cells(ligne, "H").Value = Val(CStr(InfoArticle(reference, 13)))
                wsJ.Cells(ligne, "I").Value = nomClient
                wsJ.Cells(ligne, "J").Value = "Sortie automatique par facture validée"
            End If
        Next i
        Verrouiller wsJ
    End If

    ' ---------- PDF A5 -----------------------------------------------------
    If valide Then
        Deverrouiller wsD
        wsD.Range("I5").Value = statut
        Verrouiller wsD
        Application.Calculate
        fichierPDF = ExporterPDF(wsD, numDoc)
    End If

    Application.ScreenUpdating = True

    ' ---------- fin ---------------------------------------------------------
    If valide Then
        ViderFormulaire
        If fichierPDF <> "" Then
            Info typeDoc & " " & numDoc & " enregistrée." & vbNewLine & vbNewLine & _
                 "PDF A5 : " & fichierPDF & vbNewLine & _
                 IIf(typeDoc = "FACTURE", "Le stock a été mis à jour.", _
                                          "Aucune sortie de stock (proforma).")
        Else
            Info typeDoc & " " & numDoc & " enregistrée." & vbNewLine & _
                 "Le PDF n'a pas pu être généré : enregistrez d'abord le classeur sur le disque."
        End If
    Else
        Deverrouiller wsD
        EcrireCellule wsD, "I40", numDoc
        wsD.Range("I5").Value = "BROUILLON"
        Verrouiller wsD
        Info "Brouillon " & numDoc & " enregistré dans HISTORIQUE DOCS." & vbNewLine & _
             "Aucune sortie de stock." & vbNewLine & vbNewLine & _
             "Vous pouvez continuer à le modifier : le prochain enregistrement " & _
             "remplacera ces lignes au lieu d'en ajouter."
    End If

    Exit Sub

Nettoyage:
    Application.ScreenUpdating = True
    Alerte "L'enregistrement s'est interrompu." & vbNewLine & vbNewLine & _
           "Erreur " & Err.Number & " : " & Err.Description & vbNewLine & vbNewLine & _
           "Vérifiez HISTORIQUE DOCS : le document a pu être enregistré partiellement."
End Sub


' Efface les lignes déjà enregistrées sous ce numéro de document,
' dans l'historique comme dans le journal de stock.
Private Sub SupprimerLignesDocument(numDoc As String)
    Dim wsH As Worksheet, wsJ As Worksheet
    Dim i As Long, derniere As Long, supprimees As Long

    Set wsH = ThisWorkbook.Worksheets(FEUILLE_HISTO)
    Set wsJ = ThisWorkbook.Worksheets(FEUILLE_JOURNAL)

    Deverrouiller wsH
    derniere = ProchaineLigne(wsH, "B") - 1
    For i = derniere To LIGNE_DATA Step -1
        If Trim$(CStr(wsH.Cells(i, "B").Value)) = numDoc Then
            wsH.Rows(i).Delete
            supprimees = supprimees + 1
        End If
    Next i
    Verrouiller wsH

    Deverrouiller wsJ
    derniere = ProchaineLigne(wsJ, "A") - 1
    For i = derniere To LIGNE_DATA Step -1
        If Trim$(CStr(wsJ.Cells(i, "E").Value)) = numDoc Then wsJ.Rows(i).Delete
    Next i
    Verrouiller wsJ

    If supprimees > 0 Then RestaurerFormulesHistorique
End Sub


' Export de la zone d'impression (A1:F34, format A5) dans le sous-dossier
' "Documents" placé à côté du classeur.
Private Function ExporterPDF(ws As Worksheet, numDoc As String) As String
    Dim dossier As String, fichier As String

    If ThisWorkbook.Path = "" Then
        ExporterPDF = ""
        Exit Function
    End If

    dossier = ThisWorkbook.Path & Application.PathSeparator & "Documents"
    If Dir(dossier, vbDirectory) = "" Then MkDir dossier

    fichier = dossier & Application.PathSeparator & numDoc & ".pdf"

    On Error GoTo EchecExport
    ws.ExportAsFixedFormat Type:=xlTypePDF, Filename:=fichier, _
                           Quality:=xlQualityStandard, IncludeDocProperties:=True, _
                           IgnorePrintAreas:=False, OpenAfterPublish:=False
    ExporterPDF = fichier
    Exit Function

EchecExport:
    ExporterPDF = ""
End Function


' Remet le formulaire à blanc sans toucher aux formules.
Private Sub ViderFormulaire()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(FEUILLE_DOC)

    Deverrouiller ws
    ws.Range("B" & LIGNE_ART_DEB & ":B" & LIGNE_ART_FIN).ClearContents
    ws.Range("D" & LIGNE_ART_DEB & ":D" & LIGNE_ART_FIN).ClearContents
    ws.Range("H" & LIGNE_ART_DEB & ":I" & LIGNE_ART_FIN).Value = 0
    EcrireCellule ws, "A26", "Saisir ici les observations, garanties ou conditions particulières."
    ViderCellule ws, "C8"
    ViderCellule ws, "I40"
    ws.Range("I5").Value = "BROUILLON"
    ws.Range("F7").Value = Date
    ws.Range("F7").NumberFormat = "dd/mm/yyyy"
    Verrouiller ws

    Application.Calculate
End Sub
