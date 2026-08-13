# Base de données AADM

## Principes

- Les montants sont enregistrés en centimes entiers.
- Les échéances conservent le tarif, le membre, l’âge et le statut d’activité utilisés.
- Un paiement n’est jamais supprimé : une annulation possède sa propre trace.
- Un QR ne stocke qu’un jeton dont seule l’empreinte est conservée en base.
- Les données de démonstration sont fictives.

## Groupes de tables

### Accès

- `profiles`
- `roles`
- `user_roles`
- `access_requests`

### Membres et foyers

- `offices`
- `members`
- `households`
- `household_office_assignments`
- `household_memberships`
- `member_activity_periods`
- `member_qr_codes`

### Cotisations

- `contribution_rules`
- `rule_due_months`
- `household_rule_assignments`
- `contribution_dues`

### Paiements

- `payments`
- `payment_allocations`
- `payment_reversals`

### Exploitation

- `reminders`
- `imports`
- `audit_logs`
- `app_settings`

## Règles actuellement enregistrées

- Historique à partir du 1er janvier 2021.
- Échéances trimestrielles en mars, juin, septembre et décembre.
- Date de Paris : deuxième dimanche du mois.
- Date des sous-bureaux : règle fixe propre à chaque bureau.
- Caisse de rapatriement : 60 € par homme adulte, 20 € par femme adulte et 10 € par enfant, à la première réunion annuelle du bureau.
- Cotisation trimestrielle : 20 € par homme adulte ayant une activité rémunérée.
- Une femme ne doit que le rapatriement ; la situation de couple ne change pas le montant.

Les anciennes catégories de foyer restent archivées jusqu’au 31 décembre 2020.

## Sauvegarde

La base locale se trouve dans `.wrangler` et peut être recréée grâce aux
migrations. En production, un export SQL sera réalisé chaque semaine et avant
chaque importation importante.
