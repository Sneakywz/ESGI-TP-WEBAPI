// CRUD de la collection /seances + collection navigable (pagination, filtres, tri).
const express = require('express');
const { db, nextId } = require('../store');
const { paginer } = require('../pagination');
const { BadRequestError, NotFoundError } = require('../errors');
const { z, valider } = require('../validation');

const router = express.Router();

// Règles d'une séance, décrites une seule fois (l'id est attribué par le serveur, les champs inconnus sont ignorés).
// film_id et salle_id doivent désigner un film et une salle existants : sinon 422 (le corps est lisible,
// mais il référence une ressource absente ; ce n'est pas un 404, l'URL /seances existe bien).
const seanceSchema = z.object({
  film_id: z.number({ error: 'doit être un nombre' }).int('doit être un entier')
    .refine((id) => db.films.some((film) => film.id === id), "ce film n'existe pas"),
  salle_id: z.number({ error: 'doit être un nombre' }).int('doit être un entier')
    .refine((id) => db.salles.some((salle) => salle.id === id), "cette salle n'existe pas"),
  debut: z.iso.datetime({ error: 'doit être une date ISO 8601 en UTC, ex. 2026-12-24T20:00:00Z' }),
});

// Champs sur lesquels on autorise le tri.
const CHAMPS_TRIABLES = ['debut', 'id', 'film_id', 'salle_id'];

// Position de la séance dans le store ; lève une 404 si elle n'existe pas.
function indexDeLaSeance(id) {
  const index = db.seances.findIndex((seance) => seance.id === Number(id));
  if (index === -1) throw new NotFoundError(`La séance ${id} n'existe pas.`);
  return index;
}

// Lister : filtres optionnels et combinables, tri stable, pagination offset.
//   GET /seances?film=18&salle=2&date=2026-10-12&tri=debut,id&ordre=asc&page=1&limit=20
router.get('/', (req, res) => {
  const { film, salle, date } = req.query;

  // 1. Filtrer : un paramètre absent = pas de filtre sur ce critère.
  let seances = db.seances.filter((seance) =>
    (film === undefined || seance.film_id === Number(film)) &&
    (salle === undefined || seance.salle_id === Number(salle)) &&
    // debut est en UTC ("2026-10-12T14:00:00Z") : on compare la partie date.
    (date === undefined || seance.debut.startsWith(date))
  );

  // 2. Trier : "debut,id" par défaut. On ajoute toujours id (unique) en dernière clé
  //    pour départager les égalités : sans ça, deux séances à la même heure
  //    pourraient changer d'ordre d'un appel à l'autre (tri instable).
  const cles = (req.query.tri ?? 'debut,id').split(',');
  const cleInconnue = cles.find((cle) => !CHAMPS_TRIABLES.includes(cle));
  if (cleInconnue) {
    throw new BadRequestError(`Tri impossible sur "${cleInconnue}". Champs autorisés : ${CHAMPS_TRIABLES.join(', ')}.`);
  }
  if (!cles.includes('id')) cles.push('id');

  const sens = req.query.ordre === 'desc' ? -1 : 1;
  seances = [...seances].sort((a, b) => {
    for (const cle of cles) {
      if (a[cle] < b[cle]) return -1 * sens;
      if (a[cle] > b[cle]) return 1 * sens;
    }
    return 0;
  });

  // 3. Paginer et emballer dans l'enveloppe commune.
  res.json(paginer(seances, req.query, '/seances'));
});

// Lire : 200 + la séance, ou 404.
router.get('/:id', (req, res) => {
  const index = indexDeLaSeance(req.params.id);
  res.json(db.seances[index]);
});

// Créer : corps validé, puis 201 + en-tête Location vers la nouvelle séance.
router.post('/', valider(seanceSchema), (req, res) => {
  const seance = { id: nextId('seances'), ...req.body };

  db.seances.push(seance);
  res.status(201).location(`/seances/${seance.id}`).json(seance);
});

// Remplacer : PUT envoie la ressource entière, donc tous les champs sont requis (sinon 422).
router.put('/:id', valider(seanceSchema), (req, res) => {
  const index = indexDeLaSeance(req.params.id);

  const seance = { id: db.seances[index].id, ...req.body };
  db.seances[index] = seance;
  res.json(seance);
});

// Modifier : PATCH ne change que les champs fournis (tous optionnels, mais valides s'ils sont présents).
router.patch('/:id', valider(seanceSchema.partial()), (req, res) => {
  const index = indexDeLaSeance(req.params.id);

  const seance = Object.assign(db.seances[index], req.body);
  res.json(seance);
});

// Supprimer : 204, ou 404 si la séance n'existe pas.
// Une réservation n'a pas de sens sans sa séance (sous-ressource) : suppression en cascade
// des réservations de la séance, de leurs sièges réservés et de leurs paiements.
router.delete('/:id', (req, res) => {
  const index = indexDeLaSeance(req.params.id);

  const id = db.seances[index].id;
  const idsReservations = db.reservations.filter((r) => r.seance_id === id).map((r) => r.id);

  db.reservations = db.reservations.filter((r) => r.seance_id !== id);
  db.reservations_sieges = db.reservations_sieges.filter((rs) => !idsReservations.includes(rs.reservation_id));
  db.paiements = db.paiements.filter((p) => !idsReservations.includes(p.reservation_id));
  db.seances.splice(index, 1);

  res.status(204).end();
});

module.exports = router;
