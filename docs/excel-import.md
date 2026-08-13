# Import Excel de l’historique AADM

## Utilisation

1. Ouvrir **Bureau**, puis **Plus** et **Importer Excel**.
2. Télécharger le nouveau `Modele-import-AADM.xlsx`.
3. Remplir `Foyers_Membres`, `Activites` et `Cotisations`.
4. Analyser le fichier, corriger les erreurs, écrire **IMPORTER**, puis confirmer.

## Onglets

- `Foyers_Membres` : une ligne par personne. La date de naissance est obligatoire.
- `Activites` : périodes datées `travaille` ou `ne_travaille_pas` pour les hommes adultes. Toute activité rémunérée compte.
- `Cotisations` : une ligne par membre, type et échéance. Les types sont `rapatriement_annuel` et `trimestrielle_homme_actif`.
- `Exemple` : données fictives à recopier comme guide, jamais importées.

Les dates de cotisation doivent correspondre au calendrier du bureau importateur. Le rapatriement est exigible à sa première réunion annuelle ; la cotisation des hommes actifs à chacune de ses quatre réunions trimestrielles.

## Contrôles

- administrateur central uniquement ; fichier `.xlsx` de 5 Mo maximum ;
- 5 000 lignes maximum au total ;
- barème recalculé par l’application : 60 € par homme adulte, 20 € par femme adulte et 10 € par enfant pour le rapatriement, 20 € par trimestre et par homme adulte actif ;
- périodes d’activité sans chevauchement, à partir du 1er janvier 2021 et après les 18 ans ;
- membres et cotisations existants jamais écrasés ;
- import atomique, jeton d’analyse valable 30 minutes et trace d’audit.

Les paiements historiques sont enregistrés sans créer de faux reçus de caisse. Toujours conserver une copie du fichier original.
