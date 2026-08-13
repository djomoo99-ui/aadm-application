# Lot 12 — Journal, exports et sauvegardes

## Journal d'audit

Le journal est réservé à l'administrateur. Il affiche l'auteur, la date,
l'action, le type de donnée concerné et, lorsqu'elles existent, les anciennes
et nouvelles valeurs. Il peut être filtré par texte et par période. Les
résultats sont paginés par 25 et ne sont jamais mis en cache par le navigateur.

## Exports CSV

Trois exports administratifs sont disponibles :

- membres et foyers ;
- cotisations ;
- paiements et annulations.

L'administrateur doit recopier `EXPORTER` et indiquer une raison. Le fichier
utilise l'UTF-8, le séparateur point-virgule et une marque de compatibilité
Excel. Les valeurs commençant par `=`, `+`, `-` ou `@` sont neutralisées afin
qu'une donnée importée ne soit pas exécutée comme formule par le tableur.

## Sauvegarde métier

La sauvegarde JSON comprend les données associatives utiles : foyers, membres,
relations familiales, règles, échéances, paiements, affectations, annulations,
rappels, imports, paramètres et journal.

Elle exclut volontairement :

- les mots de passe et comptes de connexion ;
- les sessions ;
- les secrets ;
- les profils et rôles techniques ;
- les codes QR et leurs empreintes.

Le manifeste contient la version du format, la date, l'identifiant de
sauvegarde, les compteurs par table et une empreinte SHA-256 calculée sur les
données. Le téléchargement direct est refusé au-delà de 50 000 lignes métier.

## Conservation recommandée

1. Créer une sauvegarde avant tout import important et au moins une fois par
   mois pendant le pilote.
2. Conserver deux copies privées sur deux supports différents.
3. Ne jamais envoyer le fichier sur WhatsApp ou par e-mail non protégé.
4. Noter la date, l'auteur et l'endroit où la copie est conservée.
5. Tester la procédure de restauration avant le passage en production.

## Restauration

Le lot 12 prépare le format de sauvegarde mais ne permet pas encore de restaurer
depuis l'interface. Cette limitation évite qu'un administrateur écrase la base
active par erreur. La restauration sera testée d'abord sur une base séparée,
puis intégrée au lot consacré au retour arrière et à la mise en ligne.

Test reproductible :

```bash
npm run test:lot12
```
