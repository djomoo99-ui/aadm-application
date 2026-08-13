# Alertes internes et anomalies — lot 14

## Objectif

Le bureau dispose d’un écran unique pour repérer les données à vérifier et les événements importants. Le système ne contacte personne : il produit uniquement des alertes internes.

## Éléments contrôlés

- demandes d’accès en attente ;
- foyers et cotisations marqués « à vérifier » ;
- membres actifs sans date de naissance ;
- hommes adultes sans statut d’activité daté ;
- foyers actifs sans téléphone ;
- paiements dont le montant n’est pas égal aux affectations plus le crédit restant ;
- réunions prévues dans les 30 prochains jours.

Chaque alerte possède une empreinte unique liée à son type et à l’élément concerné. Relancer le contrôle actualise l’alerte existante sans créer de doublon.

## Cycle de traitement

Une alerte est ouverte, prise en charge ou résolue. Le contrôleur et l’administrateur peuvent lancer un contrôle et modifier son état avec une note obligatoire. Tous les rôles du bureau peuvent consulter la liste.

Quand une anomalie disparaît des données, le contrôle la résout automatiquement. Si une alerte a été classée résolue sans corriger sa cause, le contrôle suivant la rouvre. Ces actions sont inscrites dans le journal d’audit.

## API et sécurité

- `GET /api/office/alerts` : consultation par les rôles du bureau, filtres `status`, `severity` et `page` ;
- `POST /api/office/alerts/scan` : contrôle réservé aux rôles `controller` et `admin`, raison obligatoire ;
- `PATCH /api/office/alerts/:id` : prise en charge ou résolution réservée aux mêmes rôles, note obligatoire.

Les requêtes d’écriture gardent les protections d’origine, de format JSON, de session active et de rôle côté serveur. Les alertes et les contrôles font partie de la sauvegarde métier, contrairement aux mots de passe, sessions et secrets.

## Vérification locale

Exécuter `npm run test:lot14`. Le scénario vérifie les permissions, les sept types d’alerte, la déduplication, la réouverture d’une anomalie persistante, la résolution automatique après correction, les filtres et le journal d’audit.
