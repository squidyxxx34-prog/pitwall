# Pitwall — timing live motorsport

Deux façons d'utiliser le même moteur :
- **App desktop gratuite & open-source** (`/desktop`) — Electron, buildée en `.exe` public par CI GitHub, aucune donnée envoyée nulle part.
- **Version web** (`/web`) — le même code, à héberger toi-même (Vercel/Netlify/Cloudflare Pages, gratuit) pour ceux qui ne peuvent pas lancer l'exe.

## Règle non négociable : pas d'invention de données

Chaque écran affiche `—` (grisé) quand une donnée n'arrive pas, plutôt que d'inventer, d'interpoler ou de réafficher une ancienne valeur comme si elle était live. Le badge de statut en haut à droite passe :
- **vert** = données de moins de 15s
- **orange** = figées depuis 15 à 60s
- **rouge** = plus de 60s sans donnée / pas de signal

## Réalité des sources de données (à lire avant de vendre quoi que ce soit)

- **F1** : [OpenF1](https://openf1.org) — API communautaire gratuite, en lecture directe depuis le navigateur (pas de clé requise). C'est la seule série branchée pour l'instant : positions, écarts, tours, secteurs, pneus, arrêts, météo, messages de direction de course, position brute sur piste.
- **WEC / IMSA / GT World Challenge / DTM, etc.** : **aucune API live gratuite et fiable n'existe aujourd'hui.** Leurs timing officiels sont des pages fermées. Le sélecteur de série dans l'app affiche un bandeau explicite "non disponible" plutôt que d'inventer des données — ne le retire pas et ne le remplace pas par des valeurs bidon pour "faire joli" en démo.
- Si tu veux ajouter une série plus tard : écris un connecteur qui remplit les mêmes `Map` que celles utilisées pour F1 dans `app.js` (`positions`, `intervals`, `laps`, `stints`, `location`, `weather`) — le rendu (tableau, carte, détail) est déjà générique et ne dépend pas de F1 spécifiquement.

## Lancer l'app desktop en local

```bash
cd desktop
npm install
npm start
```

## Builder le .exe publiquement (open source, CI gratuite)

1. Pousse ce dossier sur un repo GitHub public.
2. Crée un tag de version : `git tag v1.0.0 && git push --tags`
3. Le workflow `.github/workflows/build.yml` build l'exe sur `windows-latest` et l'attache automatiquement à la Release GitHub — n'importe qui peut le télécharger sans passer par toi.
4. (Optionnel) Ajoute une icône dans `desktop/build/icon.ico` et remets la ligne `"icon": "build/icon.ico"` dans `desktop/package.json` → `build.win`.

## Déployer la version web (gratuite pour toi, hébergement statique)

`web/` est un site statique pur (HTML/CSS/JS, zéro build). Dépose-le tel quel sur Vercel, Netlify ou Cloudflare Pages (plan gratuit, drag & drop du dossier).

## Version payante (4.99€ one-shot) — Stripe intégré

`web/paywall.js` affiche un overlay avec un **Stripe Buy Button embarqué** (composant officiel `<stripe-buy-button>`, aucun backend requis) au-dessus de `index.html`. L'app desktop ne l'affiche jamais : `preload.js` expose `window.pitwallDesktop.isDesktop`, et `paywall.js` débloque directement quand ce flag est présent.

**À faire avant mise en prod** — dans le Dashboard Stripe :
1. Crée un **Payment Link** ou un **Buy Button** à 4,99€ (one-time, pas d'abonnement).
2. Dans sa configuration de confirmation, mets la redirection vers `https://tonsite.com/?unlocked=1`.
3. Récupère ta clé publique (`pk_live_...` ou `pk_test_...`) et l'identifiant du bouton (`buy_btn_...`).
4. Ouvre `web/paywall.js` et remplace `STRIPE_PUBLISHABLE_KEY` et `STRIPE_BUY_BUTTON_ID` par ces valeurs.

Tant que ces valeurs ne sont pas remplacées, l'overlay affiche un message "Stripe non configuré" au lieu du bouton — pas de faux bouton de paiement qui ne marche pas.

**Limite assumée** : le déblocage est vérifié côté client (`localStorage` + paramètre `?unlocked=1` après paiement). Ça suffit pour un MVP, mais n'empêche pas un partage de lien organisé entre deux personnes. Si ça devient un vrai problème, il faudra une fonction serverless (Vercel Function / Cloudflare Worker) qui vérifie la session Stripe côté serveur avant de servir la page — pas la peine de la construire avant d'avoir un premier client payant.

## Structure

```
pitwall/
├── web/            → site statique (source de vérité de l'UI)
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── paywall.js  → overlay Stripe, désactivé automatiquement dans l'app desktop
├── desktop/        → wrapper Electron autour de /web (toujours gratuit, sans paywall)
│   ├── main.js
│   ├── preload.js  → expose window.pitwallDesktop.isDesktop pour désactiver le paywall
│   ├── package.json
│   └── .github/workflows/build.yml   → CI qui build le .exe public
└── README.md
```

## Licence

MIT — voir `LICENSE`.
