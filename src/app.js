// Configuration de l'API : middlewares et routes.
// Ce fichier ne démarre pas le serveur, pour que les tests puissent importer l'app directement.
const express = require('express');
const filmsRouter = require('./routes/films');
const seancesRouter = require('./routes/seances');
const reservationsRouter = require('./routes/reservations');
const { routeInconnue, errorHandler } = require('./errorHandler');
const { exigerJson } = require('./validation');

const app = express();

// Écritures sans Content-Type: application/json -> 400.
app.use(exigerJson);

// Lit le corps des requêtes JSON et le met dans req.body.
app.use(express.json());

// Point d'entrée : indique les collections disponibles.
app.get('/', (req, res) => {
  res.json({ api: 'API Cinéma', collections: ['/films', '/seances', '/reservations'] });
});

// Chaque collection a son routeur : toutes les URIs /films/... sont gérées dans routes/films.js.
app.use('/films', filmsRouter);
app.use('/seances', seancesRouter);
// Réservations : routes complètes (/seances/:id/sieges, /seances/:id/reservations, /reservations/...).
app.use(reservationsRouter);

// Toujours en dernier : URL inconnue -> 404, puis toutes les erreurs -> problem+json.
app.use(routeInconnue);
app.use(errorHandler);

module.exports = app;
