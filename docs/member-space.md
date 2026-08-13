# Espace membre connecté à D1

## Données affichées

L’espace membre ne contient plus de montant fictif. Après la connexion, le Worker retrouve :

1. le profil lié à la session ;
2. le membre AADM rattaché à ce profil ;
3. le foyer actif de ce membre ;
4. uniquement les échéances, paiements et membres de ce foyer.

Le téléphone n’envoie jamais un identifiant de foyer à consulter. Un paramètre ajouté manuellement dans l’adresse est ignoré. Cette règle empêche un membre de demander les données d’un autre foyer.

## Calculs du tableau de bord

- **Reste exigible aujourd’hui** : montants restant à payer sur les échéances arrivées à leur date, sans inclure les échéances futures.
- **Total annuel attendu** : toutes les échéances de l’année affichée.
- **Total annuel payé** : sommes affectées aux échéances de l’année affichée.
- **Prochaine échéance** : première échéance future enregistrée dans D1.
- **Dernier paiement** : dernier encaissement validé dans la table des paiements. Aucun paiement n’est inventé si l’historique importé ne contient que des soldes.

## Code couleur

Le statut est calculé à partir de la plus ancienne échéance arrivée à date et non entièrement payée :

| Couleur | Signification |
|---|---|
| Bleu | À jour |
| Vert | Retard inférieur à 6 mois |
| Orange | Retard de 6 à 11 mois |
| Rouge | Retard de 12 mois ou plus |
| Violet | Données absentes ou à vérifier |
| Gris | Échéance future |

## Historique

Le sélecteur commence en 2021 conformément au registre du projet. Une année sans données affiche un état vide explicite ; l’application ne fabrique pas d’échéances historiques.

## QR personnel

Le QR est disponible uniquement pour un compte actif rattaché à un membre. Il contient :

- un identifiant aléatoire ;
- une signature HMAC-SHA-256 produite avec un secret serveur.

Il ne contient ni nom, ni numéro de membre, ni montant. Avant de le renvoyer au téléphone, le serveur vérifie également son empreinte enregistrée dans D1.

## Routes privées

```text
GET /api/member/dashboard
GET /api/member/contributions
GET /api/member/profile
GET /api/member/qr
```

Ces quatre routes exigent une session valide, un profil actif, un membre rattaché et un foyer actif.

