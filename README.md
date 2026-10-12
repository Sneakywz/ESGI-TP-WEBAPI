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

## Collection de requêtes

`requests/api-cinema.insomnia.json` : une requête par opération, à importer dans Insomnia
(*Import* → fichier). L'URL de base est la variable `base_url` de l'environnement de la collection.

## Pagination

Pagination offset (`?page=&limit=`, 20 éléments par défaut, 100 au maximum) avec une enveloppe
`data` / `pagination` / `links` commune à toutes les collections ; la pagination par curseur sera
ajoutée en séance 4.
