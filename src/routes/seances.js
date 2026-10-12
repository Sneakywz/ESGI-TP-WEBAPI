// CRUD de la collection /seances + collection navigable (pagination, filtres, tri).
const express = require('express');
const { db, nextId } = require('../store');
const { paginer } = require('../pagination');

const router = express.Router();

// Champs qu'un client peut envoyer (l'id est attribué par le serveur, les champs inconnus sont ignorés).
const CHAMPS = ['film_id', 'salle_id', 'debut'];

// Champs sur lesquels on autorise le tri.
const CHAMPS_TRIABLES = ['debut', 'id', 'film_id', 'salle_id'];

function indexDeLaSeance(id) {
  return db.seances.findIndex((seance) => seance.id === Number(id));
}

function seanceIntrouvable(res, id) {
  // Format provisoire : remplacé par application/problem+json au TP3.
  return res.status(404).json({ erreur: `La séance ${id} n'existe pas.` });
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
    return res.status(400).json({ erreur: `Tri impossible sur "${cleInconnue}". Champs autorisés : ${CHAMPS_TRIABLES.join(', ')}.` });
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
  if (index === -1) return seanceIntrouvable(res, req.params.id);
  res.json(db.seances[index]);
});

// Créer : 201 + en-tête Location vers la nouvelle séance.
router.post('/', (req, res) => {
  const corps = req.body ?? {};
  const seance = { id: nextId('seances') };
  for (const champ of CHAMPS) seance[champ] = corps[champ];

  db.seances.push(seance);
  res.status(201).location(`/seances/${seance.id}`).json(seance);
});

// Remplacer : PUT remplace la ressource entière, un champ absent du corps est effacé (null).
router.put('/:id', (req, res) => {
  const index = indexDeLaSeance(req.params.id);
  if (index === -1) return seanceIntrouvable(res, req.params.id);

  const corps = req.body ?? {};
  const seance = { id: db.seances[index].id };
  for (const champ of CHAMPS) seance[champ] = corps[champ] ?? null;

  db.seances[index] = seance;
  res.json(seance);
});

// Modifier : PATCH ne change que les champs fournis.
router.patch('/:id', (req, res) => {
  const index = indexDeLaSeance(req.params.id);
  if (index === -1) return seanceIntrouvable(res, req.params.id);

  const corps = req.body ?? {};
  const seance = db.seances[index];
  for (const champ of CHAMPS) {
    if (corps[champ] !== undefined) seance[champ] = corps[champ];
  }

  res.json(seance);
});

// Supprimer : 204, ou 404 si la séance n'existe pas.
// Une réservation n'a pas de sens sans sa séance (sous-ressource) : suppression en cascade
// des réservations de la séance, de leurs sièges réservés et de leurs paiements.
router.delete('/:id', (req, res) => {
  const index = indexDeLaSeance(req.params.id);
  if (index === -1) return seanceIntrouvable(res, req.params.id);

  const id = db.seances[index].id;
  const idsReservations = db.reservations.filter((r) => r.seance_id === id).map((r) => r.id);

  db.reservations = db.reservations.filter((r) => r.seance_id !== id);
  db.reservations_sieges = db.reservations_sieges.filter((rs) => !idsReservations.includes(rs.reservation_id));
  db.paiements = db.paiements.filter((p) => !idsReservations.includes(p.reservation_id));
  db.seances.splice(index, 1);

  res.status(204).end();
});

module.exports = router;
