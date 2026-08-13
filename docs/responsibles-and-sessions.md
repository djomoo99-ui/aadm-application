# Lot 11 — Responsables, rôles et sessions

## Principe

Seul un administrateur actif peut ouvrir l'écran `Responsables`. Les contrôles
sont effectués par le serveur : masquer un bouton ou modifier une adresse ne
permet jamais d'obtenir un rôle supplémentaire.

## Rôles

- **Agent de saisie** : foyers, membres, enfants et téléphones.
- **Contrôleur** : consultation, validations et vérifications.
- **Trésorier** : encaissements, rappels et corrections autorisées.
- **Administrateur** : rôles, suspensions, calendrier, imports et réglages sensibles.

Une même personne peut recevoir plusieurs rôles. Chaque attribution et retrait
demande une raison. Le rôle membre n'est pas modifié par cet écran.

## Protections administratives

- Un administrateur ne peut pas retirer son propre rôle administrateur.
- Il ne peut pas suspendre son propre compte depuis cet écran.
- Le dernier administrateur actif doit toujours être conservé.
- Une modification fondée sur une ancienne version de la fiche est refusée avec
  le statut `409` ; l'administrateur doit recharger la fiche.
- Les demandes encore en attente restent traitées dans `Demandes d'accès`.

## Suspension et réactivation

La suspension ne supprime ni le compte, ni les rôles, ni le journal. Elle ferme
immédiatement toutes les sessions de la personne. Après réactivation, la
personne doit se reconnecter avec son mot de passe.

## Téléphone perdu ou accès suspect

1. Ouvrir `Administration`, puis `Responsables`.
2. Rechercher la personne.
3. Ouvrir `Fermer les sessions`.
4. Recopier exactement `FERMER LES SESSIONS`.
5. Indiquer la raison, puis confirmer.

Si la personne ne doit plus accéder à l'application, utiliser plutôt
`Suspendre et déconnecter`.

## Journal

Les changements de rôles, suspensions, réactivations et fermetures de sessions
sont enregistrés avec l'auteur, la personne concernée, la date, la raison et
les anciennes/nouvelles valeurs.

Test reproductible :

```bash
npm run test:lot11
```
