# Automatisation et préparation à la mise en ligne

## Contrôle quotidien

Cloudflare appelle le Worker chaque jour à `06:00 UTC` grâce à la règle `0 6 * * *`. Les horaires Cron de Cloudflare utilisent UTC. Le gestionnaire planifié lance le même moteur que le bouton « Lancer le contrôle » et inscrit l’action sous l’identité « Système ».

Une clé quotidienne (`scheduled:AAAA-MM-JJ`) empêche un second passage le même jour de créer une autre exécution. Un nouveau passage reste possible le lendemain. Les alertes elles-mêmes conservent aussi leur empreinte unique.

Documentation officielle :

- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/workers/examples/cron-trigger/

## Avant toute mise en ligne

Ne pas utiliser de vraies données de membres avant la fin des étapes suivantes. Les commandes doivent être exécutées dans le dossier du projet depuis un ordinateur avec Node.js installé.

### 1. Tester localement

```bash
npm install
npm run test:lot15
npm run test:lot16
```

### 2. Connecter Cloudflare

```bash
npx wrangler login
npx wrangler d1 create aadm-db
```

La deuxième commande affiche l’identifiant réel de la base. Remplacer ensuite la valeur fictive `00000000-0000-0000-0000-000000000000` du champ `database_id` dans `wrangler.jsonc`.

### 3. Appliquer les migrations à la base distante

```bash
npx wrangler d1 migrations apply aadm-db --remote
```

Les migrations sont versionnées et doivent être appliquées dans leur ordre. Documentation officielle : https://developers.cloudflare.com/d1/reference/migrations/

### 4. Créer le Worker une première fois

```bash
npm run deploy
```

Copier l’adresse `https://...workers.dev` affichée, mais ne pas encore transmettre ce lien aux membres.

### 5. Enregistrer les deux secrets

Générer deux valeurs différentes :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Puis saisir une valeur différente dans chacune des commandes suivantes :

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put QR_TOKEN_SECRET
```

Ne jamais copier ces valeurs dans le code, une capture d’écran ou un message. Documentation officielle : https://developers.cloudflare.com/workers/wrangler/commands/workers/#secret-put

### 6. Vérifier la production vide

Ouvrir successivement :

```text
https://VOTRE-ADRESSE/api/health
https://VOTRE-ADRESSE/api/health/database
```

Les deux réponses doivent contenir `"ok": true`.

### 7. Créer le premier administrateur

Créer d’abord un compte depuis `/inscription`, puis lancer sur votre ordinateur :

```bash
npm run admin:promote:remote -- votre@email.fr
```

Se reconnecter ensuite. Le menu du bureau doit apparaître. Cette commande est uniquement destinée au premier administrateur ; les responsables suivants sont gérés depuis l’application.

### 8. Contrôles avant ouverture aux membres

- ouvrir « Plus > Bureaux AADM », créer chaque sous-bureau et vérifier son jour fixe ;
- rattacher chaque responsable à Paris, Lyon ou son bureau local ;
- rattacher ou transférer les foyers avant de générer les calendriers ;
- générer et contrôler le calendrier séparément pour chaque bureau ;
- créer une sauvegarde métier vide ;
- vérifier l’inscription, la connexion et la déconnexion ;
- tester une demande d’accès fictive ;
- lancer manuellement le centre d’alertes ;
- vérifier le tableau du bureau sur téléphone ;
- attendre ou simuler le contrôle planifié et vérifier « Système » ;
- conserver l’archive source précédente pour revenir en arrière.

La règle planifiée peut mettre plusieurs minutes à se propager après un déploiement. Pour la tester localement, Cloudflare recommande `npx wrangler dev --test-scheduled`, puis l’URL `/__scheduled`.

## État réel

Le code, la règle quotidienne, les migrations et la procédure sont préparés et testés localement. Aucun compte Cloudflare, aucune base distante, aucun secret et aucune adresse publique n’ont été créés dans ce lot.
