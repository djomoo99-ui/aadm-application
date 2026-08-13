# Calendrier et génération des cotisations

## Barème officiel depuis le 1er janvier 2021

La génération crée des échéances individuelles :

- caisse annuelle de rapatriement à la première réunion de l’année du bureau : 60 € par homme adulte, 20 € par femme adulte, 10 € par enfant ;
- cotisation trimestrielle : 20 € par homme adulte ayant une activité rémunérée à la date de la réunion ;
- une femme ne doit que la caisse de rapatriement ;
- le statut célibataire ou en couple ne change aucun montant ;
- deux hommes adultes actifs dans le même foyer doivent chacun 20 €, soit 40 € par trimestre pour le foyer.
- la correction du barème de rapatriement est appliquée aux échéances depuis le 1er janvier 2021 ; les montants réellement payés sont conservés et le reste dû est recalculé.
- le solde d’une cotisation annuelle de rapatriement doit être encaissé intégralement en une seule opération ; aucun nouveau paiement partiel n’est accepté.

Toute activité donnant lieu à une rémunération est considérée comme une activité rémunérée.

## Dates locales

Chaque bureau possède une règle fixe enregistrée dans `offices` : rang dans le mois et jour de la semaine. Paris utilise le deuxième dimanche. Un autre bureau peut utiliser, par exemple, le troisième dimanche. Les quatre réunions trimestrielles sont générées en mars, juin, septembre et décembre.

## Données nécessaires

Avant la génération, chaque membre actif doit avoir une date de naissance. Chaque homme adulte doit aussi avoir un historique de périodes `travaille` / `ne travaille pas`. Les périodes sont datées afin que les calculs depuis 2021 restent reproductibles.

## Sécurité de la génération

- accès administrateur uniquement ;
- confirmation textuelle et motif obligatoires ;
- aucune échéance existante n’est écrasée ;
- unicité par membre, bureau, date et type de cotisation ;
- montant, âge et statut d’activité sont figés dans l’échéance ;
- une trace d’audit et un bilan de génération sont enregistrés.
