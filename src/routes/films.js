// CRUD de la collection /films.
const express = require('express');
const { db, nextId } = require('../store');
const { paginer } = require('../pagination');

const router = express.Router();

// Champs qu'un client peut envoyer. L'id n'en fait pas partie : c'est le serveur qui l'attribue.
// Les champs inconnus envoyés par le client sont ignorés.
const CHAMPS = ['titre', 'duree_min', 'classification'];

function indexDuFilm(id) {
  return db.films.findIndex((film) => film.id === Number(id));
}

function filmIntrouvable(res, id) {
  // Format provisoire : remplacé par application/problem+json au TP3.
  return res.status(404).json({ erreur: `Le film ${id} n'existe pas.` });
}

// Lister : 200 + enveloppe paginée, triée par id (unique, donc tri stable).
router.get('/', (req, res) => {
  const films = [...db.films].sort((a, b) => a.id - b.id);
  res.json(paginer(films, req.query, '/films'));
});

// Lire : 200 + le film, ou 404.
router.get('/:id', (req, res) => {
  const index = indexDuFilm(req.params.id);
  if (index === -1) return filmIntrouvable(res, req.params.id);
  res.json(db.films[index]);
});

// Créer : 201 + en-tête Location vers le nouveau film.
router.post('/', (req, res) => {
  const corps = req.body ?? {};
  const film = { id: nextId('films') };
  for (const champ of CHAMPS) film[champ] = corps[champ];

  db.films.push(film);
  res.status(201).location(`/films/${film.id}`).json(film);
});

// Remplacer : PUT remplace la ressource entière, un champ absent du corps est effacé (null).
router.put('/:id', (req, res) => {
  const index = indexDuFilm(req.params.id);
  if (index === -1) return filmIntrouvable(res, req.params.id);

  const corps = req.body ?? {};
  const film = { id: db.films[index].id };
  for (const champ of CHAMPS) film[champ] = corps[champ] ?? null;

  db.films[index] = film;
  res.json(film);
});

// Modifier : PATCH ne change que les champs fournis, les autres restent intacts.
router.patch('/:id', (req, res) => {
  const index = indexDuFilm(req.params.id);
  if (index === -1) return filmIntrouvable(res, req.params.id);

  const corps = req.body ?? {};
  const film = db.films[index];
  for (const champ of CHAMPS) {
    if (corps[champ] !== undefined) film[champ] = corps[champ];
  }

  res.json(film);
});

// Supprimer : 204 sans corps, 404 si le film n'existe pas.
// Refus (409) si des séances projettent encore ce film : elles pointeraient vers un film disparu.
router.delete('/:id', (req, res) => {
  const index = indexDuFilm(req.params.id);
  if (index === -1) return filmIntrouvable(res, req.params.id);

  const id = db.films[index].id;
  const nbSeances = db.seances.filter((seance) => seance.film_id === id).length;
  if (nbSeances > 0) {
    return res.status(409).json({ erreur: `Le film ${id} est encore projeté dans ${nbSeances} séance(s).` });
  }

  db.films.splice(index, 1);
  res.status(204).end();
});

module.exports = router;
