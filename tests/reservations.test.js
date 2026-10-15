// Tests du piège du sujet : réservation concurrente d'un même siège (hold, 409, expiration).
const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');
const horloge = require('../src/horloge');

const SEANCE = 725; // 2026-11-20, salle 2 (rangées A à H, sièges 1 à 10) ; H6 est déjà confirmé dans le kit

function reserver(clientId, sieges) {
  return request(app).post(`/seances/${SEANCE}/reservations`).send({ client_id: clientId, sieges });
}

// Après chaque test, l'horloge redevient l'heure réelle.
const heureReelle = horloge.maintenant;
afterEach(() => { horloge.maintenant = heureReelle; });

describe('Piège du sujet : deux clients sur le même siège', () => {
  test('deux réservations concurrentes du même siège -> un 201 (hold) et un 409', async () => {
    // Les deux requêtes partent en même temps.
    const [alice, bob] = await Promise.all([reserver(1, ['A1']), reserver(2, ['A1'])]);
    const statuts = [alice.status, bob.status].sort();
    assert.deepEqual(statuts, [201, 409]);

    const gagnant = alice.status === 201 ? alice : bob;
    const perdant = alice.status === 409 ? alice : bob;
    assert.equal(gagnant.body.statut, 'held');
    assert.match(perdant.headers['content-type'], /application\/problem\+json/);
    assert.match(perdant.body.type, /siege-indisponible$/);

    // Aucun état incohérent : une seule réservation active sur A1.
    const liste = await request(app).get(`/seances/${SEANCE}/reservations?limit=100`);
    const actives = liste.body.data.filter(
      (r) => ['held', 'confirmed'].includes(r.statut) && r.sieges.includes('A1'),
    );
    assert.equal(actives.length, 1);
  });

  test('un siège confirmé (H6 dans le kit) -> 409', async () => {
    const res = await reserver(1, ['H6']);
    assert.equal(res.status, 409);
  });

  test('le plan de salle marque le siège tenu comme pris', async () => {
    await reserver(1, ['B2']);
    const plan = await request(app).get(`/seances/${SEANCE}/sieges`);
    assert.equal(plan.body.sieges.find((s) => s.code === 'B2').statut, 'pris');
  });

  test('un hold expiré ne bloque plus le siège -> 201 pour le client suivant', async () => {
    const alice = await reserver(1, ['C3']);
    assert.equal(alice.status, 201);

    // On avance l'horloge de 11 minutes : le hold (10 min) d'Alice a expiré.
    horloge.maintenant = () => new Date(Date.now() + 11 * 60 * 1000);

    const bob = await reserver(2, ['C3']);
    assert.equal(bob.status, 201);
    const relue = await request(app).get(`/reservations/${alice.body.id}`);
    assert.equal(relue.body.statut, 'expired');
  });

  test('une réservation annulée libère le siège', async () => {
    const alice = await reserver(1, ['D4']);
    await request(app).patch(`/reservations/${alice.body.id}`).send({ statut: 'cancelled' });

    const bob = await reserver(2, ['D4']);
    assert.equal(bob.status, 201);
  });

  test('siège absent de la salle -> 422 (pas 409 : la demande ne sera jamais valide)', async () => {
    const res = await reserver(1, ['Z99']);
    assert.equal(res.status, 422);
    assert.equal(res.body.errors[0].field, 'sieges');
  });
});
