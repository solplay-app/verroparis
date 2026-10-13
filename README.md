# Verroparis — version sécurisée, paiement Jèko, mobile

## Ce qui a changé
| Avant | Maintenant |
|---|---|
| Solde modifiable depuis le navigateur | Solde modifiable **uniquement par le serveur** (règles Firebase verrouillées) |
| N'importe quel joueur pouvait se rendre admin | Impossible : création de profil limitée à `balance: 0, isAdmin: false` |
| Cotes/résultats écrits par n'importe quel joueur connecté | Écrits par le serveur (`sync-odds`) ; lecture seule pour les clients |
| Mise validée côté navigateur (cote falsifiable) | `place-bet` recalcule tout depuis les cotes du serveur |
| Règlement dans le navigateur | Règlement serveur, idempotent, remboursement si match annulé / sans résultat > 72 h |
| Dépôt manuel avec capture d'écran | Jèko (Wave, Orange, MTN, Moov, Djamo) + webhook signé, crédit automatique et unique |
| Retrait fictif (stocké dans le navigateur) | Débit serveur + file d'attente admin (`/admin.html`) |
| 500 000 FCFA offerts à l'inscription | 0 |
| Clés The Odds API / API-Football dans le site | Retirées du site, stockées dans Netlify |
| — | PWA installable (manifest, icônes, service worker) |

## Mise en ligne (dans cet ordre)
1. **Change tes clés API** (elles étaient publiques) : régénère la clé The Odds API et la clé API-Football.
2. **Netlify → Site settings → Environment variables** :
   | Nom | Valeur |
   |---|---|
   | JEKO_API_KEY, JEKO_API_KEY_ID | Dashboard Jèko |
   | JEKO_STORE_ID | UUID du magasin (`GET /partner_api/stores`) |
   | JEKO_WEBHOOK_SECRET | Dashboard Jèko → Paramètres → API & Webhooks |
   | FIREBASE_SERVICE_ACCOUNT | JSON du compte de service (Firebase → Paramètres → Comptes de service), en base64 : `base64 -w0 cle.json` |
   | SITE_URL | `https://ton-domaine` (sans `/` final) |
   | ODDS_API_KEY | nouvelle clé The Odds API |
   | FOOTBALL_API_KEY | nouvelle clé API-Football |
   | MIN_DEPOSIT_FCFA | `500` (mets `5` pour le test) |
   Optionnels : `ODDS_SPORTS`, `MAX_STAKE_FCFA`, `MAX_PAYOUT_FCFA`, `MIN_WITHDRAW_FCFA`, `COMMISSION_RATE`, `CASHBACK_RATE`, `ODDS_MARGIN`, `JEKO_CENTS_FACTOR`.
3. **Déploie** ce dossier sur Netlify (le build installe `firebase-admin`).
4. **Webhook Jèko** : `https://ton-domaine/.netlify/functions/jeko-webhook`.
5. **Règles Firebase** : Console → Realtime Database → Règles → colle `database.rules.json` → Publier.
   ⚠ Vérifie d'abord que ton compte admin a `isAdmin: true` dans `users/<uid>`.
6. Lance une première synchro : appelle `https://ton-domaine/.netlify/functions/sync-odds` (ensuite c'est automatique toutes les 30 min).

## Test avant l'argent réel
1. `MIN_DEPOSIT_FCFA=5` → dépôt de 5 F → `deposits/…` passe à `credited`, solde +5. Si le montant vu chez Jèko est faux, ajuste `JEKO_CENTS_FACTOR`.
2. Rejoue le webhook : le solde ne bouge pas.
3. Place un pari, vérifie le débit, puis un retrait → il apparaît dans `/admin.html` → « Versé » (après envoi réel depuis le dashboard Jèko) ou « Refuser » (remboursé).
4. Tente depuis la console du navigateur d'écrire `users/<uid>/balance` : doit être refusé.

## Application mobile
- **PWA** : ouvre le site sur le téléphone → « Ajouter à l'écran d'accueil ».
- **APK / Play Store** (sur ton PC) : `npm i @capacitor/core @capacitor/cli @capacitor/android`, `npx cap init Verroparis ci.verroparis.app --web-dir public`, `npx cap add android`, `npx cap sync`, `npx cap open android`. Ajoute dans `capacitor.config.json` : `"server": {"url": "https://ton-domaine"}` pour que l'app appelle tes fonctions.

## Limites actuelles — à décider
- **Football uniquement** : basket, tennis, rugby, Coupe du monde et FIFA virtuel sont refusés par le serveur (pas de source de résultats fiable côté serveur, et les résultats du FIFA virtuel sont calculables à l'avance par un joueur). Les ajouter = brancher une source de scores serveur.
- **Pas de pari en direct** : seuls les matchs non commencés sont acceptés (les cotes sont rafraîchies toutes les 30 min).
- **Retraits validés par un admin** : l'API de reversement Jèko n'était pas dans la doc fournie. Quand tu l'as, on automatise dans `admin-api.js`.
- **Frais Jèko** (1,5 %) : non répercutés sur le joueur.
- Les statistiques locales de l'app (anciens écrans « Analyse & ROI », transactions) viennent encore d'un module local au navigateur et ne reflètent pas les retraits serveur.
- Obligations de l'agrément LONACI (KYC, âge, jeu responsable, déclarations) : à vérifier de ton côté.

## Tests
`npm test` : signature Jèko, montants, puis webhook (rejoué 3×), paris (cotes falsifiées, match commencé, solde), règlement (gain, perte, annulé, sans résultat), retraits et remboursements admin.

## Régénérer `public/index.html`
`python3 tools/patch-client.py <index.html d'origine> public/index.html`
