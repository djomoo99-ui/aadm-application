# Rappels WhatsApp AADM

## Principe

L’application ne contacte pas automatiquement les membres. Elle prépare un message et ouvre WhatsApp. Le responsable vérifie le destinataire et le texte, puis appuie lui-même sur **Envoyer**.

Ce fonctionnement ne nécessite pas d’abonnement à une API WhatsApp.

## Rappels proposés

- **Cotisations passées** : foyers ayant un montant exigible non réglé.
- **Cotisations à venir** : prochaine échéance située dans les 60 jours.
- Le code couleur du retard est conservé : vert, orange ou rouge.
- Une nouvelle préparation identique est bloquée pendant 7 jours.

## Parcours du trésorier

1. Ouvrir **Bureau**, puis **Plus**.
2. Choisir **Rappels WhatsApp**.
3. Filtrer les cotisations passées ou à venir.
4. Lire le message avant de sélectionner le foyer.
5. Sélectionner au maximum 20 messages.
6. Choisir **Préparer les messages**.
7. Ouvrir WhatsApp pour chaque destinataire.
8. Vérifier le numéro et le texte.
9. Envoyer manuellement.
10. Revenir dans l’application et choisir **J’ai réellement envoyé le message**.

## Numéros de téléphone

Le numéro doit utiliser un format international afin d’éviter une erreur de pays :

- France : `+33...`
- Sénégal : `+221...`

Un numéro commençant seulement par `06` ou `07` est signalé comme incomplet et ne peut pas être utilisé pour préparer un lien WhatsApp.

## Permissions

| Action | Contrôleur | Trésorier | Administrateur |
| --- | ---: | ---: | ---: |
| Voir les foyers à rappeler | Oui | Oui | Oui |
| Voir l’historique | Oui | Oui | Oui |
| Préparer un message | Non | Oui | Oui |
| Confirmer un envoi | Non | Oui | Oui |

## Traçabilité

L’historique conserve :

- le foyer ;
- le numéro utilisé ;
- le montant et la période ;
- le message préparé ;
- la personne ayant préparé le rappel ;
- l’état `préparé` ou `envoyé` ;
- la personne et la date de confirmation d’envoi.

L’état `envoyé` dépend de la confirmation humaine. L’application ne peut pas vérifier techniquement que WhatsApp a réellement livré ou lu le message.

