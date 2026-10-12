// CRUD de la collection /films.
const express = require('express');
const { db, nextId } = require('../store');
const { paginer } = require('../pagination');
const { NotFoundError, ConflictError } = require('../errors');
const { z, valider } = require('../validation');

const router = express.Router();

// Règles d'un film, décrites une seule fois.
// L'id n'en fait pas partie : c'est le serveur qui l'attribue. Les champs inconnus sont ignorés.
const filmSchema = z.object({
  titre: z.string({ error: 'doit être une chaîne' }).trim().min(1, 'ne doit pas être vide'),
  duree_min: z.number({ error: 'doit être un nombre' }).int('doit être un entier').positive('doit être supérieur à 0'),
  classification: z.enum(['TP', '-12', '-16', '-18'], { error: 'doit valoir TP, -12, -16 ou -18' }),
});

// Position du film dans le store ; lève une 404 s'il n'existe pas.
function indexDuFilm(id) {
  const index = db.films.findIndex((film) => film.id === Number(id));
  if (index === -1) throw new NotFoundError(`Le film ${id} n'existe pas.`);
  return index;
}

// Lister : 200 + enveloppe paginée, triée par id (unique, donc tri stable).
router.get('/', (req, res) => {
  const films = [...db.films].sort((a, b) => a.id - b.id);
  res.json(paginer(films, req.query, '/films'));
});

// Lire : 200 + le film, ou 404.
router.get('/:id', (req, res) => {
  const index = indexDuFilm(req.params.id);
  res.json(db.films[index]);
});

// Créer : corps validé (tous les champs requis), puis 201 + en-tête Location vers le nouveau film.
router.post('/', valider(filmSchema), (req, res) => {
  const film = { id: nextId('films'), ...req.body };

  db.films.push(film);
  res.status(201).location(`/films/${film.id}`).json(film);
});

// Remplacer : PUT envoie la ressource entière, donc tous les champs sont requis (sinon 422).
// Le film est remplacé par le corps reçu, rien n'est conservé de l'ancien à part l'id.
router.put('/:id', valider(filmSchema), (req, res) => {
  const index = indexDuFilm(req.params.id);

  const film = { id: db.films[index].id, ...req.body };
  db.films[index] = film;
  res.json(film);
});

// Modifier : PATCH ne change que les champs fournis (tous optionnels, mais valides s'ils sont présents).
router.patch('/:id', valider(filmSchema.partial()), (req, res) => {
  const index = indexDuFilm(req.params.id);

  const film = Object.assign(db.films[index], req.body);
  res.json(film);
});

// Supprimer : 204 sans corps, 404 si le film n'existe pas.
// Refus (409) si des séances projettent encore ce film : elles pointeraient vers un film disparu.
router.delete('/:id', (req, res) => {
  const index = indexDuFilm(req.params.id);

  const id = db.films[index].id;
  const nbSeances = db.seances.filter((seance) => seance.film_id === id).length;
  if (nbSeances > 0) {
    throw new ConflictError(`Le film ${id} est encore projeté dans ${nbSeances} séance(s).`);
  }

  db.films.splice(index, 1);
  res.status(204).end();
});

module.exports = router;
