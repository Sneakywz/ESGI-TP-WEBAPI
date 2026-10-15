// Réservations : plan de salle, hold temporaire, lecture, annulation.
// C'est ici que se joue le piège du sujet : deux clients sur le même siège.
const express = require('express');
const { db, nextId } = require('../store');
const horloge = require('../horloge');
const { paginer } = require('../pagination');
const { NotFoundError, ConflictError, ValidationError } = require('../errors');
const { z, valider } = require('../validation');
const {
  DUREE_HOLD_MINUTES, siegesDeLaSeance, idsSiegesPris, representer,
} = require('../reservations');

const router = express.Router();

const reservationSchema = z.object({
  client_id: z.number({ error: 'doit être un nombre' }).int('doit être un entier')
    .refine((id) => db.clients.some((client) => client.id === id), "ce client n'existe pas"),
  sieges: z.array(z.string({ error: 'chaque siège doit être un code, ex. F12' }), { error: 'doit être une liste de codes de sièges' })
    .min(1, 'au moins un siège')
    .refine((codes) => new Set(codes).size === codes.length, 'un même siège est demandé deux fois'),
});

const annulationSchema = z.object({
  statut: z.literal('cancelled', { error: 'seule la valeur "cancelled" est acceptée (annulation)' }),
});

function trouverSeance(id) {
  const seance = db.seances.find((s) => s.id === Number(id));
  if (!seance) throw new NotFoundError(`La séance ${id} n'existe pas.`);
  return seance;
}

function trouverReservation(id) {
  const reservation = db.reservations.find((r) => r.id === Number(id));
  if (!reservation) throw new NotFoundError(`La réservation ${id} n'existe pas.`);
  return reservation;
}

// Plan de salle d'une séance : chaque siège avec son statut (libre / pris), calculé à la demande.
router.get('/seances/:id/sieges', (req, res) => {
  const seance = trouverSeance(req.params.id);
  const pris = idsSiegesPris(seance.id);

  const sieges = siegesDeLaSeance(seance).map((siege) => ({
    code: siege.code,
    rangee: siege.rangee,
    numero: siege.numero,
    statut: pris.has(siege.id) ? 'pris' : 'libre',
  }));

  res.json({
    seance_id: seance.id,
    salle_id: seance.salle_id,
    places_libres: sieges.filter((s) => s.statut === 'libre').length,
    sieges,
  });
});

// Réservations d'une séance (sous-collection), même enveloppe paginée que les autres collections.
router.get('/seances/:id/reservations', (req, res) => {
  const seance = trouverSeance(req.params.id);
  const reservations = db.reservations
    .filter((r) => r.seance_id === seance.id)
    .sort((a, b) => a.id - b.id)
    .map(representer);
  res.json(paginer(reservations, req.query, `/seances/${seance.id}/reservations`));
});

// Réserver des sièges : crée une réservation en hold (bloquée DUREE_HOLD_MINUTES minutes).
//   404 séance inconnue · 422 demande invalide · 409 siège déjà pris · 201 hold créé
router.post('/seances/:id/reservations', valider(reservationSchema), (req, res) => {
  const seance = trouverSeance(req.params.id);
  const maintenant = horloge.maintenant();

  // 422 : demandes qui ne seront jamais valides (séance passée, siège absent de la salle).
  const erreurs = [];
  if (new Date(seance.debut) <= maintenant) {
    erreurs.push({ field: 'seance', message: 'la séance a déjà commencé' });
  }
  const siegesSalle = siegesDeLaSeance(seance);
  const demandes = req.body.sieges.map((code) => siegesSalle.find((s) => s.code === code));
  const inconnus = req.body.sieges.filter((code, i) => !demandes[i]);
  if (inconnus.length > 0) {
    erreurs.push({ field: 'sieges', message: `absents du plan de la salle ${seance.salle_id} : ${inconnus.join(', ')}` });
  }
  if (erreurs.length > 0) throw new ValidationError(erreurs);

  // 409 : la demande est valide, mais l'état actuel l'empêche (siège tenu ou confirmé par quelqu'un).
  // Vérification et enregistrement s'enchaînent sans attente : aucune autre requête ne peut s'intercaler.
  const pris = idsSiegesPris(seance.id);
  const dejaPris = demandes.filter((siege) => pris.has(siege.id)).map((siege) => siege.code);
  if (dejaPris.length > 0) {
    throw new ConflictError(
      `Siège(s) ${dejaPris.join(', ')} de la séance ${seance.id} déjà réservé(s).`,
      'siege-indisponible',
      'Siège indisponible',
    );
  }

  const reservation = {
    id: nextId('reservations'),
    seance_id: seance.id,
    client_id: req.body.client_id,
    statut: 'held',
    cree_le: maintenant.toISOString(),
    expire_le: new Date(maintenant.getTime() + DUREE_HOLD_MINUTES * 60 * 1000).toISOString(),
  };
  db.reservations.push(reservation);
  for (const siege of demandes) {
    db.reservations_sieges.push({ reservation_id: reservation.id, siege_id: siege.id });
  }

  res.status(201).location(`/reservations/${reservation.id}`).json(representer(reservation));
});

// Lire une réservation.
router.get('/reservations/:id', (req, res) => {
  res.json(representer(trouverReservation(req.params.id)));
});

// Annuler : PATCH du statut (pas de DELETE, pour garder l'historique et le lien avec le paiement).
router.patch('/reservations/:id', valider(annulationSchema), (req, res) => {
  const reservation = representer(trouverReservation(req.params.id));
  if (reservation.statut !== 'held' && reservation.statut !== 'confirmed') {
    throw new ConflictError(`La réservation ${reservation.id} est déjà ${reservation.statut}, elle ne peut plus être annulée.`);
  }
  const stockee = trouverReservation(req.params.id);
  stockee.statut = 'cancelled';
  stockee.expire_le = null;
  res.json(representer(stockee));
});

module.exports = router;
