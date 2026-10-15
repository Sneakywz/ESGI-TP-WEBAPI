// Logique métier des réservations : hold temporaire, sièges pris, représentation.
const { db } = require('./store');
const horloge = require('./horloge');

// Durée pendant laquelle un siège reste bloqué avant confirmation.
const DUREE_HOLD_MINUTES = 10;

// Un hold dont l'heure d'expiration est passée ne bloque plus rien : il devient "expired".
// L'expiration est constatée à la lecture (pas de tâche planifiée).
function actualiserStatut(reservation) {
  if (reservation.statut === 'held' && new Date(reservation.expire_le) <= horloge.maintenant()) {
    reservation.statut = 'expired';
  }
  return reservation;
}

// LA règle du piège : une réservation bloque ses sièges si elle est confirmée,
// ou tenue (held) et pas encore expirée.
function bloqueSesSieges(reservation) {
  const statut = actualiserStatut(reservation).statut;
  return statut === 'confirmed' || statut === 'held';
}

// Sièges de la salle où a lieu la séance (le plan de salle).
function siegesDeLaSeance(seance) {
  return db.sieges.filter((siege) => siege.salle_id === seance.salle_id);
}

// Ids des sièges déjà pris pour une séance.
function idsSiegesPris(seanceId) {
  const idsReservationsActives = db.reservations
    .filter((r) => r.seance_id === seanceId && bloqueSesSieges(r))
    .map((r) => r.id);
  return new Set(
    db.reservations_sieges
      .filter((rs) => idsReservationsActives.includes(rs.reservation_id))
      .map((rs) => rs.siege_id),
  );
}

// Représentation d'une réservation dans l'API : la table de liaison reservations_sieges
// n'est pas exposée, elle devient un champ "sieges" (une ressource n'est pas une table).
function representer(reservation) {
  actualiserStatut(reservation);
  const idsSieges = db.reservations_sieges
    .filter((rs) => rs.reservation_id === reservation.id)
    .map((rs) => rs.siege_id);
  const codes = db.sieges.filter((s) => idsSieges.includes(s.id)).map((s) => s.code);
  return { ...reservation, sieges: codes };
}

module.exports = { DUREE_HOLD_MINUTES, actualiserStatut, siegesDeLaSeance, idsSiegesPris, representer };
