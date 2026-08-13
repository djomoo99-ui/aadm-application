# AADM — Gestion des cotisations

Application privée destinée aux membres et au bureau de l’association AADM.

## Prérequis

- Node.js dans une version LTS récente
- npm

## Installation locale

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Ouvrir ensuite l’adresse indiquée par Vite dans le terminal.

## Vérifications

```bash
npm run typecheck
npm run build
npm run db:check-auth:local
```

## Route de contrôle de l’API

```text
GET /api/health
```

Cette route permet de vérifier que le Worker répond correctement.

## Sécurité

- Ne jamais enregistrer `.dev.vars` dans Git.
- Ne jamais placer de données réelles de membres dans les données de test.
- Ne jamais placer une clé ou un mot de passe directement dans le code.

## État du projet

Lot 17 : espace membre et bureau alimentés par D1, QR, paiements en espèces,
import Excel, rappels WhatsApp et administration sécurisée des foyers, membres,
enfants, téléphones, périodes d’activité rémunérée, responsables, rôles, sessions,
journal d'audit, exports, sauvegardes métier, calendrier, génération annuelle et
centre interne d’alertes et d’anomalies, contrôle quotidien, bureau central de
Paris, sous-bureaux locaux, calendriers distincts et préparation au déploiement
Cloudflare. Depuis 2021, le calcul distingue la caisse annuelle de rapatriement
(60 € par homme adulte, 20 € par femme adulte, 10 € par enfant) et la cotisation trimestrielle de 20 € par homme
adulte ayant une activité rémunérée.

## Routes de démonstration

```text
/connexion
/inscription
/validation
/membre
/membre/cotisations
/membre/qr
/membre/compte
/bureau
/bureau/membres
/bureau/membre
/bureau/scanner
/bureau/paiement
/bureau/paiements
/bureau/import-excel
/bureau/rappels
/bureau/administration
/bureau/categories
/bureau/responsables
/bureau/journal
/bureau/sauvegardes
/bureau/calendrier
/bureau/alertes
/bureau/bureaux
/bureau/validations
/bureau/plus
```

L’espace membre et l’espace du bureau utilisent les données D1. Le scanner, les
paiements, les fiches, l’import Excel et les rappels WhatsApp sont fonctionnels.

## Base de données locale

Générer une migration après une modification du schéma :

```bash
npm run db:generate
```

Créer ou mettre à jour la base locale :

```bash
npm run db:migrate:local
```

Ajouter les données fictives :

```bash
npm run db:seed:local
```

Contrôler les tables et les soldes fictifs :

```bash
npm run db:check:local
```

Le dossier `.wrangler` contient uniquement la base locale et n’est jamais
inclus dans le dépôt ou le fichier livré.

## Authentification

Consulter `docs/authentication.md` pour le parcours de validation, les rôles et
les mesures de sécurité. La vérification de l’e-mail et le mot de passe oublié
seront ajoutés avec le véritable service d’e-mail ; ils ne sont pas simulés.

Consulter `docs/member-space.md` pour les calculs de solde, le code couleur,
l’isolation des foyers et le fonctionnement du QR.

Consulter `docs/cash-payments.md` pour le scan caméra, la recherche manuelle,
l’affectation aux anciennes dettes, le crédit et la protection contre les doubles
envois.

Consulter `docs/office-dashboard-and-corrections.md` pour le tableau du bureau,
les fiches des foyers, l’historique des reçus et les corrections comptables.

Consulter `docs/excel-import.md` pour le modèle, l’aperçu, les protections contre
les doublons et la confirmation administrative.

Consulter `docs/whatsapp-reminders.md` pour la sélection, les messages, les rôles,
le format des numéros et la confirmation manuelle des envois.

Consulter `docs/household-administration.md` pour la création et la modification
des foyers, les désactivations sans suppression, les périodes d’activité et
le journal d'audit.

Consulter `docs/responsibles-and-sessions.md` pour les rôles, la suspension des
accès, la fermeture des sessions et la procédure en cas de téléphone perdu.

Consulter `docs/audit-exports-backups.md` pour le journal, les exports CSV, le
contenu des sauvegardes et les règles de conservation.

Consulter `docs/calendar-and-due-generation.md` pour les calendriers fixes par bureau,
les deux cotisations officielles, les instantanés et la génération annuelle.

Consulter `docs/two-contribution-policy.md` pour le barème exact appliqué depuis 2021.

Consulter `docs/internal-alerts-and-anomalies.md` pour les demandes en attente,
les dates de naissance, activités ou téléphones manquants, les incohérences de
paiement, les réunions proches et leur résolution contrôlée.

Consulter `docs/automation-and-deployment.md` pour le contrôle quotidien, la
protection contre les doubles exécutions et la mise en ligne pas à pas.

Consulter `docs/multi-office-management.md` pour créer Lyon ou un autre
sous-bureau, rattacher les responsables, transférer les foyers et préserver
l’historique financier.
