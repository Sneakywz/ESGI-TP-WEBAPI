// Configuration de l'API : middlewares et routes.
// Ce fichier ne démarre pas le serveur, pour que les tests puissent importer l'app directement.
const express = require('express');
const filmsRouter = require('./routes/films');
const seancesRouter = require('./routes/seances');

const app = express();

// Lit le corps des requêtes JSON et le met dans req.body.
app.use(express.json());

// Point d'entrée : indique les collections disponibles.
app.get('/', (req, res) => {
  res.json({ api: 'API Cinéma', collections: ['/films', '/seances'] });
});

// Chaque collection a son routeur : toutes les URIs /films/... sont gérées dans routes/films.js.
app.use('/films', filmsRouter);
app.use('/seances', seancesRouter);

module.exports = app;
