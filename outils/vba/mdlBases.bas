Attribute VB_Name = "mdlBases"
Option Explicit

' =====================================================================
'  KATANGA TECHCARE — Bases clients / articles / entrées de stock
'
'    AjouterClient        -> bouton de l'onglet BASE CLIENTS
'    EnregistrerArticle   -> bouton de l'onglet BASE ARTICLES
'    ValiderEntreeStock   -> bouton de l'onglet ENTREES STOCK
' =====================================================================


' ---------------------------------------------------------------------
'  BASE CLIENTS — formulaire O4:P12
' ---------------------------------------------------------------------
Public Sub AjouterClient()
    Dim ws As Worksheet
    Dim ligne As Long
    Dim idClient As String

    Set ws = ThisWorkbook.Worksheets(FEUILLE_CLIENTS)

    If Trim$(CStr(ws.Range("P4").Value)) = "" Then
        Alerte "Le nom du client (case P4) est obligatoire."
        Exit Sub
    End If

    idClient = ProchainId("CLI-", ws, "A")

    If MsgBox("Ajouter le client " & idClient & " : " & _
              Trim$(CStr(ws.Range("P6").Value) & " " & CStr(ws.Range("P4").Value)) & " ?", _
              vbYesNo + vbQuestion, TITRE) <> vbYes Then Exit Sub

    Deverrouiller ws
    ligne = ProchaineLigne(ws, "A")

    ws.Cells(ligne, "A").Value = idClient
    ws.Cells(ligne, "B").Value = UCase$(Trim$(CStr(ws.Range("P4").Value)))   ' Nom
    ws.Cells(ligne, "C").Value = UCase$(Trim$(CStr(ws.Range("P5").Value)))   ' Postnom
    ws.Cells(ligne, "D").Value = UCase$(Trim$(CStr(ws.Range("P6").Value)))   ' Prénom
    ws.Cells(ligne, "E").Value = Trim$(CStr(ws.Range("P7").Value))           ' Société
    ws.Cells(ligne, "F").Value = Trim$(CStr(ws.Range("P8").Value))           ' Téléphone
    ws.Cells(ligne, "H").Value = Trim$(CStr(ws.Range("P9").Value))           ' Ville
    ws.Cells(ligne, "I").Value = Trim$(CStr(ws.Range("P10").Value))          ' Commune
    ws.Cells(ligne, "J").Value = Trim$(CStr(ws.Range("P11").Value))          ' Adresse
    ws.Cells(ligne, "L").Value = Trim$(CStr(ws.Range("P12").Value))          ' Type client

    ws.Range("P4:P11").ClearContents
    ws.Range("P12").Value = "PARTICULIER"
    Verrouiller ws

    Application.Calculate
    Info "Client " & idClient & " ajouté (ligne " & ligne & ")." & vbNewLine & _
         "Il est disponible dans la liste déroulante de la facture."
End Sub


' ---------------------------------------------------------------------
'  BASE ARTICLES — formulaire R4:S13
' ---------------------------------------------------------------------
Public Sub EnregistrerArticle()
    Dim ws As Worksheet, wsJ As Worksheet
    Dim ligne As Long, ligneJ As Long
    Dim reference As String, designation As String
    Dim qteEntree As Double

    Set ws = ThisWorkbook.Worksheets(FEUILLE_ARTICLES)
    Set wsJ = ThisWorkbook.Worksheets(FEUILLE_JOURNAL)

    designation = Trim$(CStr(ws.Range("S4").Value))
    If designation = "" Then
        Alerte "La désignation de l'article (case S4) est obligatoire."
        Exit Sub
    End If

    If UCase$(Trim$(CStr(ws.Range("S5").Value))) = "SERVICE" Then
        reference = ProchainId("SRV-", ws, "A")
    Else
        reference = ProchainId("ART-", ws, "A")
    End If

    If MsgBox("Enregistrer l'article " & reference & " : " & designation & " ?", _
              vbYesNo + vbQuestion, TITRE) <> vbYes Then Exit Sub

    qteEntree = Val(CStr(ws.Range("S11").Value))

    Deverrouiller ws
    ligne = ProchaineLigne(ws, "A")

    ws.Cells(ligne, "A").Value = reference
    ws.Cells(ligne, "B").Value = designation
    ws.Cells(ligne, "C").Value = Trim$(CStr(ws.Range("S5").Value))    ' Catégorie
    ws.Cells(ligne, "D").Value = Trim$(CStr(ws.Range("S6").Value))    ' Fournisseur
    ws.Cells(ligne, "E").Value = Val(CStr(ws.Range("S7").Value))      ' Coût achat
    ws.Cells(ligne, "F").Value = Val(CStr(ws.Range("S8").Value))      ' Transport unitaire
    ws.Cells(ligne, "G").Value = Val(CStr(ws.Range("S9").Value))      ' Autres frais
    ws.Cells(ligne, "I").Value = Val(CStr(ws.Range("S10").Value))     ' Marge %
    ws.Cells(ligne, "K").Value = qteEntree                            ' Quantité entrée
    ws.Cells(ligne, "N").Value = Val(CStr(ws.Range("S12").Value))     ' Seuil alerte
    ws.Cells(ligne, "O").Value = Trim$(CStr(ws.Range("S13").Value))   ' Garantie

    ' formules calculées de la ligne (au cas où elle serait au-delà du bloc existant)
    ws.Cells(ligne, "H").Formula = "=E" & ligne & "+F" & ligne & "+G" & ligne
    ws.Cells(ligne, "J").Formula = "=H" & ligne & "*(1+I" & ligne & ")"
    ws.Cells(ligne, "L").Formula = _
        "=SUMIFS('" & FEUILLE_HISTO & "'!$H$4:$H$1000,'" & FEUILLE_HISTO & "'!$F$4:$F$1000,A" & ligne & _
        ",'" & FEUILLE_HISTO & "'!$C$4:$C$1000,""FACTURE"",'" & FEUILLE_HISTO & "'!$P$4:$P$1000,""" & _
        StatutValide("FACTURE") & """)"
    ws.Cells(ligne, "M").Formula = "=K" & ligne & "-L" & ligne

    ws.Range("S4:S9").ClearContents
    ws.Range("S11").ClearContents
    ws.Range("S13").ClearContents
    Verrouiller ws

    ' trace de la quantité initiale dans le journal de stock
    If qteEntree > 0 Then
        Deverrouiller wsJ
        ligneJ = ProchaineLigne(wsJ, "A")
        wsJ.Cells(ligneJ, "A").Value = Date
        wsJ.Cells(ligneJ, "A").NumberFormat = "dd/mm/yyyy"
        wsJ.Cells(ligneJ, "B").Value = "ENTRÉE"
        wsJ.Cells(ligneJ, "C").Value = reference
        wsJ.Cells(ligneJ, "D").Value = designation
        wsJ.Cells(ligneJ, "E").Value = "CREATION"
        wsJ.Cells(ligneJ, "F").Value = qteEntree
        wsJ.Cells(ligneJ, "G").Value = 0
        wsJ.Cells(ligneJ, "H").Value = qteEntree
        wsJ.Cells(ligneJ, "I").Value = Trim$(CStr(ws.Cells(ligne, "D").Value))
        wsJ.Cells(ligneJ, "J").Value = "Stock initial à la création de l'article"
        Verrouiller wsJ
    End If

    Application.Calculate
    Info "Article " & reference & " enregistré (ligne " & ligne & ")." & vbNewLine & _
         "Prix de vente conseillé : " & Format$(ws.Cells(ligne, "J").Value, "$#,##0.00")
End Sub


' ---------------------------------------------------------------------
'  ENTREES STOCK — formulaire A4:B11
' ---------------------------------------------------------------------
Public Sub ValiderEntreeStock()
    Dim ws As Worksheet, wsA As Worksheet, wsJ As Worksheet
    Dim ligne As Long, ligneA As Long, ligneJ As Long
    Dim reference As String, designation As String, numMouvement As String
    Dim qte As Double, coutUnitaire As Double, transport As Double, autres As Double
    Dim majCout As VbMsgBoxResult

    Set ws = ThisWorkbook.Worksheets(FEUILLE_ENTREES)
    Set wsA = ThisWorkbook.Worksheets(FEUILLE_ARTICLES)
    Set wsJ = ThisWorkbook.Worksheets(FEUILLE_JOURNAL)

    If Not IsDate(ws.Range("B4").Value) Then
        Alerte "Saisissez une date valide en B4."
        Exit Sub
    End If

    reference = Trim$(CStr(ws.Range("B5").Value))
    ligneA = LigneArticle(reference)
    If ligneA = 0 Then
        Alerte "La référence " & reference & " n'existe pas dans BASE ARTICLES." & vbNewLine & _
               "Créez d'abord l'article, puis revenez ici."
        Exit Sub
    End If

    qte = Val(CStr(ws.Range("B7").Value))
    If qte <= 0 Then
        Alerte "La quantité reçue (case B7) doit être supérieure à zéro."
        Exit Sub
    End If

    coutUnitaire = Val(CStr(ws.Range("B8").Value))
    transport = Val(CStr(ws.Range("B9").Value))
    autres = Val(CStr(ws.Range("B10").Value))
    designation = CStr(InfoArticle(reference, 2))
    numMouvement = ProchainId("ENT-", ws, "E")

    If MsgBox("Enregistrer l'entrée " & numMouvement & " : " & qte & " x " & _
              designation & " ?", vbYesNo + vbQuestion, TITRE) <> vbYes Then Exit Sub

    ' ---- journal des entrées (colonnes D à L de la feuille) --------------
    Deverrouiller ws
    ligne = ProchaineLigne(ws, "E")
    ws.Cells(ligne, "D").Value = ws.Range("B4").Value
    ws.Cells(ligne, "D").NumberFormat = "dd/mm/yyyy"
    ws.Cells(ligne, "E").Value = numMouvement
    ws.Cells(ligne, "F").Value = reference
    ws.Cells(ligne, "G").Value = designation
    ws.Cells(ligne, "H").Value = Trim$(CStr(ws.Range("B6").Value))
    ws.Cells(ligne, "I").Value = qte
    ws.Cells(ligne, "J").Value = coutUnitaire
    ws.Cells(ligne, "K").Value = transport
    ws.Cells(ligne, "L").Value = autres

    ws.Range("B5:B11").ClearContents
    ws.Range("B4").Value = Date
    ws.Range("B4").NumberFormat = "dd/mm/yyyy"
    Verrouiller ws

    ' ---- mise à jour de la quantité entrée de l'article -------------------
    Deverrouiller wsA
    wsA.Cells(ligneA, "K").Value = Val(CStr(wsA.Cells(ligneA, "K").Value)) + qte

    If coutUnitaire > 0 Then
        majCout = MsgBox("Mettre à jour le coût d'achat de " & reference & " ?" & vbNewLine & _
                         "Actuel : " & Format$(wsA.Cells(ligneA, "E").Value, "$#,##0.00") & _
                         "    Nouveau : " & Format$(coutUnitaire, "$#,##0.00"), _
                         vbYesNo + vbQuestion, TITRE)
        If majCout = vbYes Then
            wsA.Cells(ligneA, "E").Value = coutUnitaire
            If qte > 0 Then wsA.Cells(ligneA, "F").Value = (transport + autres) / qte
        End If
    End If
    Verrouiller wsA

    Application.Calculate

    ' ---- journal de stock --------------------------------------------------
    Deverrouiller wsJ
    ligneJ = ProchaineLigne(wsJ, "A")
    wsJ.Cells(ligneJ, "A").Value = ws.Cells(ligne, "D").Value
    wsJ.Cells(ligneJ, "A").NumberFormat = "dd/mm/yyyy"
    wsJ.Cells(ligneJ, "B").Value = "ENTRÉE"
    wsJ.Cells(ligneJ, "C").Value = reference
    wsJ.Cells(ligneJ, "D").Value = designation
    wsJ.Cells(ligneJ, "E").Value = numMouvement
    wsJ.Cells(ligneJ, "F").Value = qte
    wsJ.Cells(ligneJ, "G").Value = 0
    wsJ.Cells(ligneJ, "H").Value = Val(CStr(InfoArticle(reference, 13)))
    wsJ.Cells(ligneJ, "I").Value = Trim$(CStr(ws.Cells(ligne, "H").Value))
    wsJ.Cells(ligneJ, "J").Value = "Entrée de stock " & numMouvement
    Verrouiller wsJ

    Info "Entrée " & numMouvement & " enregistrée." & vbNewLine & _
         "Nouveau stock de " & reference & " : " & InfoArticle(reference, 13)
End Sub
