# Gestion du bureau central et des sous-bureaux — lot 16

## Organisation retenue

Paris est le bureau central. Lyon et les autres villes sont des sous-bureaux
locaux. Chaque bureau possède une règle fixe indépendante, par exemple :

- Paris : deuxième dimanche des mois de cotisation ;
- Lyon : troisième dimanche des mois de cotisation.

Les réunions restent fixées en mars, juin, septembre et décembre. La première
réunion porte aussi la caisse annuelle de rapatriement. Le jour exact est calculé
avec la règle du bureau concerné.

## Mise en place dans l’application

1. Se connecter avec un compte de l’administration centrale.
2. Ouvrir `Plus > Bureaux AADM`.
3. Créer Lyon avec son code, son nom, sa ville, sa semaine et son jour fixes.
4. Ouvrir `Plus > Responsables` et rattacher chaque responsable à son bureau.
5. Cocher « accès à tous les bureaux » uniquement pour l’administration
   centrale rattachée à Paris.
6. Dans `Foyers et membres`, choisir le bureau lors de la création d’un foyer.
7. En cas de déménagement, ouvrir le foyer puis « Transférer vers un autre
   bureau », indiquer la date d’effet et le motif.
8. Ouvrir le calendrier, choisir chaque bureau et générer son année séparément.

## Confidentialité locale

Un responsable local ne peut consulter que les foyers, membres, paiements,
rappels, alertes, demandes d’accès et calendrier de son bureau. Les exports
globaux, sauvegardes, imports historiques, barème et responsables restent sous
le contrôle du bureau central.

## Historique lors d’un transfert

Le transfert ferme l’ancienne période la veille de la date d’effet et ouvre une
nouvelle période. Les cotisations, paiements, rappels et réunions déjà réalisés
gardent leur bureau d’origine.

Les échéances futures non payées de l’ancien bureau sont classées comme
exemptées afin qu’elles ne soient pas réclamées deux fois. L’administrateur doit
ensuite relancer la génération du nouveau bureau. Si une échéance postérieure à
la date de transfert a déjà été payée, même partiellement, le transfert est
bloqué jusqu’à la correction par le trésorier.

Un transfert futur n’est pas enregistré à l’avance : il doit être saisi le jour
de sa prise d’effet. Cette règle évite qu’un responsable local voie un foyer
avant son arrivée réelle.

## Modification d’un calendrier

Changer la règle d’un bureau agit sur les nouvelles générations. Les réunions
et cotisations déjà créées conservent leurs dates afin de protéger l’historique.
La règle doit donc être vérifiée avant la première génération annuelle.

Test reproductible :

```bash
npm run test:lot16
```
