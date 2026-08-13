# Scanner QR et paiements en espèces

## Parcours du trésorier

1. Le trésorier ouvre **Scanner**.
2. Il autorise la caméra et vise le QR affiché sur le téléphone du membre.
3. Le serveur vérifie l’empreinte du QR actif dans D1.
4. Le nom, le numéro AADM, le foyer et le solde apparaissent.
5. Le trésorier saisit le montant et la date.
6. Un écran récapitulatif demande une deuxième confirmation.
7. Le serveur enregistre le paiement, ses affectations, le crédit éventuel, le reçu et le journal d’audit dans une même opération atomique.

Si la caméra est refusée ou indisponible, la recherche par nom, numéro AADM ou téléphone fournit une référence signée par le serveur. Le navigateur ne peut pas inventer un autre membre en modifiant cette référence.

## Permissions

| Action | Rôles autorisés |
|---|---|
| Scanner ou rechercher un membre | Agent de saisie, trésorier, administrateur |
| Enregistrer une espèce | Trésorier, administrateur |

Les contrôles sont appliqués côté serveur. L’interface masque aussi le bouton d’encaissement pour l’agent de saisie.

## Affectation du montant

Les échéances sont parcourues par date croissante :

1. ancienne dette non entièrement payée ;
2. dettes plus récentes ;
3. échéances futures déjà créées ;
4. crédit non affecté si le montant dépasse toutes les échéances disponibles.

Les échéances exonérées ou marquées « à vérifier » ne reçoivent jamais automatiquement un paiement.

## Protection contre le double paiement

Le téléphone crée une clé d’idempotence unique pour chaque formulaire. Si le réseau renvoie deux fois la même demande, la contrainte unique de D1 conserve un seul paiement et le serveur renvoie le même reçu.

## Reçu

Le reçu contient :

- un numéro unique de type `AADM-2026-XXXXXXXX` ;
- le membre et son foyer ;
- le montant reçu ;
- la date ;
- la répartition sur les échéances ;
- le crédit restant éventuel.

## Caméra

La caméra nécessite HTTPS en production. Le navigateur demande explicitement l’autorisation de l’utilisateur. Le flux vidéo reste traité sur l’appareil par le lecteur QR et n’est pas envoyé au serveur.

## Limite actuelle

L’annulation comptable d’un paiement erroné sera créée avec un motif obligatoire et une contre-écriture. Pour le moment, aucun bouton de suppression directe n’est proposé afin de protéger l’historique de caisse.

