# Sources de données — état des lieux (recherche du 05/09/2026)

Ce document résume ce qui est réellement exploitable, série par série, après recherche.
Rien ici n'est une supposition : chaque ligne vient d'une source vérifiée le jour de la recherche.
Les technologies changent vite (F1 a déjà bougé son endpoint deux fois cette année) — à revérifier
avant de bâtir quoi que ce soit dessus.

## F1 — le paysage a changé depuis le premier build de Pitwall

**OpenF1 (https://openf1.org)** — ce que Pitwall utilise actuellement :
- Données **historiques** (fin de session) : gratuites, sans authentification, comme avant.
- Données **temps réel** (pendant la session) : **désormais payantes**. OpenF1 est passé à un modèle
  d'abonnement (Stripe : https://buy.stripe.com/eVqcN41BPekP0iIalBcEw02) pour l'accès live.
- Accès live authentifié : OAuth2 (`POST https://api.openf1.org/token`) puis Bearer token sur le REST,
  ou mieux, MQTT/WebSocket (`wss://mqtt.openf1.org:8084/mqtt`) pour du vrai push temps réel.
- **Important** : OpenF1 déconseille explicitement de mettre le token dans du code client-side
  (JS de navigateur, app desktop décompilable) — l'échange identifiants → token doit se faire côté
  backend. Ça veut dire qu'un vrai live F1 payant nécessite un petit serveur (Vercel Function,
  Cloudflare Worker, etc.) qui détient le abonnement et relaie les données, pas juste le site statique
  actuel de Pitwall.
- **Impact concret sur Pitwall tel qu'il est buildé aujourd'hui** : le polling REST direct depuis
  `web/app.js` ne recevra plus de données à jour pendant une session live sans ce backend + abonnement.
  Il continuera de fonctionner pour consulter l'historique après coup.

**Flux officiel F1 (SignalR / SignalR Core)** — celui utilisé par F1 TV, reverse-engineered par la
communauté (fastf1, f1-dash, box-box...) :
- Endpoints : negotiate `https://livetiming.formula1.com/signalrcore/negotiate`,
  websocket `wss://livetiming.formula1.com/signalrcore`.
- Topics utiles : `TimingData`, `TimingAppData`, `TimingStats`, `CarData.z` (compressé zlib),
  `Position.z` (compressé zlib), `WeatherData`, `RaceControlMessages`, `TrackStatus`, `DriverList`,
  `LapCount`, `SessionInfo`, `TopThree`, `Heartbeat`, `ExtrapolatedClock`.
- Statut : **non officiel, non documenté par F1**, casse déjà arrivée cette année (migration vers
  SignalR Core mi-2026 a cassé plusieurs projets open-source le temps qu'ils s'adaptent).
- FastF1 (la lib Python de référence) indique désormais qu'un **abonnement F1TV Access/Pro/Premium**
  est nécessaire pour un accès fiable ; un mode `no_auth` existe mais "peut ne fonctionner que pour
  certaines sessions ou renvoyer des données partielles".
- Ce flux ne peut pas être consommé directement depuis le navigateur (CORS + headers spécifiques
  requis type `User-Agent`) : il faut un petit backend qui s'y connecte et relaie en SSE/WebSocket vers
  le client.

**Verdict F1** : plus de source 100% gratuite et fiable pour du vrai live sans backend. Deux options
honnêtes : (a) payer l'abonnement OpenF1 + backend léger, (b) implémenter le flux SignalR officiel
(gratuit mais non garanti, cassable à tout moment, nécessite un abonnement F1TV pour la fiabilité totale).
Aucune des deux ne tient dans le site statique actuel sans ajouter un backend.

## WEC / IMSA / ELMS / GT World Challenge — verrouillé chez Alkamel Systems

Toutes ces séries (WEC, ELMS, IMSA, GT World Challenge Europe/America/Asia) utilisent **Al Kamel
Systems** comme prestataire de chronométrage.

- Protocole propriétaire "Alkamel V2" : accès uniquement sur identifiants fournis par Al Kamel,
  moyennant un **forfait payant par championnat**, plus un routeur/antenne WiFi fournis par eux
  (pensé pour les logiciels de chronométrage type HH Timing, pas pour une app publique).
- La page de résultats publique IMSA (`imsa.results.alkamelcloud.com`) affiche un avertissement
  juridique explicite : *"the data contained on this page is wholly owned by Al Kamel Systems S.L.
  Any attempt by 3rd parties to distribute and/or disseminate any data contained on this page
  without the previous express consent by Al Kamel Systems S.L. will lead to legal action."*
- Aucune API publique, aucun endpoint JSON exposé trouvé sur les pages de scoring publiques
  (imsa.com/scoring, gt-world-challenge-*.com/live) sans exécuter leur JS propriétaire, et de toute
  façon le message légal ci-dessus s'appliquerait à toute donnée récupérée par ce biais.

**Verdict WEC/IMSA/GT World Challenge** : pas de source gratuite et légale. Construire un scraper
grand public dessus expose à un risque juridique réel (l'avertissement est explicite, pas une
formule vague). Deux voies possibles si tu veux couvrir ces séries un jour : contacter Al Kamel
directement pour un partenariat commercial, ou couvrir uniquement les résultats officiels publiés
après course (pas de live) via leurs pages publiques, sans redistribution automatisée.

## Ce qui n'a pas encore été creusé

MotoGP, Formula E, NASCAR, DTM : pas vérifiés dans cette recherche (temps limité). À faire si tu
veux étendre au-delà de F1 — à vue de nez, MotoGP (Dorna) et NASCAR ont probablement le même schéma
que WEC/IMSA (prestataire propriétaire, pas d'API publique), mais ça reste à vérifier avant de
l'affirmer.

## Recommandation concrète pour Pitwall

1. Garder OpenF1 pour l'historique (gratuit, inchangé) — utile pour du post-course, replay, stats.
2. Pour du vrai live F1 : soit payer OpenF1 + ajouter un backend léger qui détient le token et relaie
   au client (jamais le token côté navigateur ou dans l'exe), soit implémenter le flux SignalR
   officiel avec les mêmes réserves de fiabilité que la communauté open-source rencontre déjà.
3. WEC/IMSA/GT World Challenge : rester sur le bandeau "non disponible" déjà en place dans l'app —
   c'est la seule position tenable sans partenariat Alkamel.
