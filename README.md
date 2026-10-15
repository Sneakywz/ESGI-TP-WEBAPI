# API Cinéma

## Sujet fil rouge
Sujet n°2 - Billetterie de cinéma

## Stack
Langage : JavaScript (Node.js 20 ou plus) / Framework HTTP : Express / Client HTTP : Insomnia

## Lancer le projet

```bash
npm install
npm start
```

L'API écoute sur **http://localhost:3000** (port modifiable avec la variable d'environnement `PORT`).
Les données du kit (`data/seed.json`) sont chargées en mémoire au démarrage : un redémarrage remet
les données d'origine.

Pendant le développement, `npm run dev` redémarre le serveur à chaque modification du code.

## Tests

```bash
npm test
```

Tests d'intégration HTTP (`tests/api.test.js`, runner intégré `node --test` + supertest) : cas nominaux
(CRUD, pagination, filtres, tri stable) et cas d'erreur (400, 404, 409, 412, 422 en `problem+json`), et le piège du sujet (`tests/reservations.test.js` :
réservations concurrentes, expiration du hold, idempotence, ETag, curseur).
L'API n'a pas besoin d'être démarrée pour lancer les tests.

## Démo du piège : deux clients sur le même siège

```bash
npm run demo:concurrence
```

Démarre l'API et envoie en parallèle deux réservations du siège F5 de la séance 725 : un hold `201` pour
le premier, un `409` problem+json (`siege-indisponible`) pour le second, une seule réservation active.
Stratégie détaillée : `docs/api-design.md`, section « Stratégie face au piège de concurrence ».

## Collection de requêtes

`requests/api-cinema.insomnia.json` : une requête par opération, à importer dans Insomnia
(*Import* → fichier). L'URL de base est la variable `base_url` de l'environnement de la collection.
Le dossier `erreurs` rejoue les cas d'échec (validation multi-champs, JSON illisible, `Content-Type`
absent, référence inexistante, route inconnue). Le dossier `reservations` rejoue le piège (hold, `409`,
confirmation avec `Idempotency-Key`, historique par curseur) et le dossier `etag` les requêtes
conditionnelles (`304`, `412`) ; les ETag à réutiliser se collent dans les variables `etag_plan` et
`etag_film` de l'environnement.

## Pagination

Pagination offset (`?page=&limit=`, 20 éléments par défaut, 100 au maximum) avec une enveloppe
`data` / `pagination` / `links` commune à toutes les collections, sauf l'historique des réservations
(`GET /reservations`), paginé par curseur (`?after=`, suivre `links.next`) car de nouvelles réservations
s'insèrent en tête pendant le parcours.
