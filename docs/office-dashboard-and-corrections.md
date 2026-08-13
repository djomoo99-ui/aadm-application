# Tableau du bureau, membres et corrections

## Fonctionnalités disponibles

- Tableau de bord calculé depuis la base D1 : membres, foyers, espèces encaissées, montant exigible et demandes d’accès.
- Répartition des foyers avec les couleurs AADM : bleu, vert, orange, rouge et violet.
- Liste paginée de 25 foyers avec recherche par nom, numéro ou téléphone.
- Fiche d’un foyer : membres, téléphone, cotisations depuis 2021 et reçus.
- Historique des 100 derniers paiements pour le contrôleur, le trésorier et l’administrateur.
- Annulation comptable réservée au trésorier et à l’administrateur.

## Règle de correction d’un paiement

Un paiement validé n’est jamais supprimé. En cas d’erreur :

1. Le trésorier ouvre **Plus**, puis **Historique des paiements**.
2. Il sélectionne **Corriger par une annulation**.
3. Il indique une raison précise.
4. Il recopie le numéro complet du reçu.
5. L’application marque le paiement comme annulé et recalcule les cotisations concernées.
6. Le paiement, la raison, la date et le responsable restent dans l’historique et le journal d’audit.

Si le montant correct doit ensuite être enregistré, le trésorier crée un nouveau paiement depuis le scanner ou la fiche du foyer.

## Permissions

| Action | Agent de saisie | Contrôleur | Trésorier | Administrateur |
| --- | ---: | ---: | ---: | ---: |
| Voir le tableau et les foyers | Oui | Oui | Oui | Oui |
| Voir l’historique global des paiements | Non | Oui | Oui | Oui |
| Enregistrer des espèces | Non | Non | Oui | Oui |
| Annuler un paiement | Non | Non | Oui | Oui |

Toutes les permissions sont vérifiées côté serveur. Modifier une adresse ou une requête dans le navigateur ne permet pas d’obtenir un droit supplémentaire.

## Limites actuelles

- Les données locales sont fictives.
- L’import de l’historique Excel depuis 2021 n’est pas encore construit.
- L’export PDF ou l’impression d’un reçu n’est pas encore construit.
- L’application n’est pas encore déployée.
