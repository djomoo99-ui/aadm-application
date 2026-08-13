# Administration des foyers et des membres

Le bureau gère les foyers, leurs membres et l’historique nécessaire au calcul des cotisations.

## Membres

Chaque membre possède notamment un numéro AADM, un sexe, une date de naissance, une date d’adhésion et une relation au foyer. La date de naissance est indispensable pour distinguer enfant et adulte à chaque échéance.

## Activité rémunérée

Pour chaque homme adulte, l’agent enregistre des périodes datées : `travaille` ou `ne travaille pas`. Toute activité rémunérée compte. Le changement de statut clôt la période précédente et conserve l’historique.

Une modification est bloquée si elle contredirait une cotisation trimestrielle déjà payée. Lorsqu’un homme passe à `ne travaille pas`, les échéances trimestrielles futures non payées deviennent exonérées.

## Cotisations

Les anciennes catégories de foyer « homme seul », « femme seule » et « couple » sont archivées au 31 décembre 2020. Depuis le 1er janvier 2021, aucune catégorie n’est affectée au foyer : le calcul est effectué individuellement selon l’âge, le sexe et l’activité.

Tous les changements sensibles sont tracés dans le journal d’audit.
