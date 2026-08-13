# Authentification et permissions AADM

## Parcours d’un nouveau membre

1. Le membre ouvre `/inscription`.
2. Il indique son nom, son numéro AADM, son téléphone, son e-mail et un mot de passe.
3. Better Auth transforme le mot de passe avec un hachage sécurisé avant son enregistrement. Le mot de passe en clair n’est jamais stocké.
4. Le profil et la demande d’accès sont créés avec le statut `pending` (en attente).
5. Le membre peut se connecter, mais il voit uniquement l’écran de validation.
6. Un contrôleur, le trésorier ou l’administrateur compare la demande au registre des membres.
7. Après validation, le profil est rattaché au bon membre, reçoit le rôle `member` et son QR est activé.

## Rôles

| Rôle | Accès prévu |
|---|---|
| `member` | Ses propres informations et celles de son foyer |
| `data_entry` | Recherche et saisie autorisée, sans validation des comptes |
| `controller` | Contrôle et validation des nouveaux comptes |
| `treasurer` | Validation, encaissements et consultation financière autorisée |
| `admin` | Administration technique et attribution des rôles |

Les autorisations importantes sont contrôlées dans le Worker, côté serveur. Masquer un bouton dans l’interface ne constitue jamais une autorisation.

## Mesures de sécurité présentes

- Sessions conservées dans D1 pendant sept jours maximum.
- Mot de passe de 10 à 128 caractères.
- Cinq tentatives de connexion par minute et trois inscriptions par cinq minutes.
- Message de connexion générique pour ne pas révéler l’existence d’une adresse.
- Inscription sans connexion automatique afin de rendre la réponse d’un doublon générique.
- Cookies sécurisés automatiquement en HTTPS.
- Vérification de l’origine et du format JSON des actions sensibles du bureau.
- Validation des entrées avec Zod.
- Journal d’audit lors de la validation d’un compte.
- QR opaque signé par HMAC ; aucune donnée personnelle n’est placée dans le QR.

## Secrets obligatoires

- `AUTH_SECRET` signe les sessions d’authentification.
- `QR_TOKEN_SECRET` signe les identifiants QR.

Chaque secret doit être différent, aléatoire et contenir au moins 32 caractères. Les vraies valeurs doivent être placées dans les secrets Cloudflare, jamais dans le code ou dans Git.

## Premier administrateur

Le premier administrateur sera créé pendant la mise en production, après vérification de son identité dans le registre AADM. Cette opération exceptionnelle sera documentée dans la procédure de déploiement. Aucun administrateur de production n’est actuellement créé.

## Fonctions prévues avec le service d’e-mail

La vérification de l’adresse e-mail et le mot de passe oublié seront ajoutés lorsque le service d’e-mail sera configuré. Ils ne doivent pas être simulés sans prestataire réellement configuré.
