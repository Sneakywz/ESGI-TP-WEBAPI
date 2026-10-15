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

describe('Confirmation idempotente (Idempotency-Key)', () => {
  function confirmer(id, cle) {
    const requete = request(app).post(`/reservations/${id}/confirmation`);
    return cle ? requete.set('Idempotency-Key', cle) : requete;
  }

  test('rejeu avec la même clé -> même réponse, un seul paiement', async () => {
    const hold = await reserver(1, ['E5']);
    const premier = await confirmer(hold.body.id, 'cle-test-1');
    const rejeu = await confirmer(hold.body.id, 'cle-test-1');

    assert.equal(premier.status, 200);
    assert.equal(premier.body.statut, 'confirmed');
    assert.equal(rejeu.status, 200);
    assert.equal(rejeu.headers['idempotent-replayed'], 'true');
    assert.deepEqual(rejeu.body, premier.body);
    assert.equal(rejeu.body.paiement.id, premier.body.paiement.id); // pas de second paiement
  });

  test('sans Idempotency-Key -> 400', async () => {
    const hold = await reserver(1, ['E6']);
    const res = await confirmer(hold.body.id);
    assert.equal(res.status, 400);
  });

  test('même clé réutilisée pour une autre réservation -> 422', async () => {
    const a = await reserver(1, ['E7']);
    const b = await reserver(2, ['E8']);
    await confirmer(a.body.id, 'cle-test-2');
    const res = await confirmer(b.body.id, 'cle-test-2');
    assert.equal(res.status, 422);
  });

  test('confirmer un hold expiré -> 409', async () => {
    const hold = await reserver(1, ['E9']);
    horloge.maintenant = () => new Date(Date.now() + 11 * 60 * 1000);
    const res = await confirmer(hold.body.id, 'cle-test-3');
    assert.equal(res.status, 409);
    assert.match(res.body.type, /confirmation-impossible$/);
  });
});

describe('Requêtes conditionnelles (ETag)', () => {
  test('plan de salle : If-None-Match -> 304 tant que rien ne change, 200 après une réservation', async () => {
    const lecture = await request(app).get(`/seances/${SEANCE}/sieges`);
    const etag = lecture.headers.etag;
    assert.ok(etag);

    const inchange = await request(app).get(`/seances/${SEANCE}/sieges`).set('If-None-Match', etag);
    assert.equal(inchange.status, 304);

    await reserver(1, ['G7']);
    const change = await request(app).get(`/seances/${SEANCE}/sieges`).set('If-None-Match', etag);
    assert.equal(change.status, 200);
    assert.notEqual(change.headers.etag, etag);
  });

  test('film : If-Match à jour -> 200 ; If-Match obsolète -> 412 (pas de mise à jour perdue)', async () => {
    const etagLu = (await request(app).get('/films/4')).headers.etag;

    // Paul modifie avec la version qu'il a lue : accepté.
    const paul = await request(app).patch('/films/4').set('If-Match', etagLu).send({ duree_min: 100 });
    assert.equal(paul.status, 200);

    // Léa avait lu la même version : elle est désormais obsolète.
    const lea = await request(app).patch('/films/4').set('If-Match', etagLu).send({ titre: 'Autre titre' });
    assert.equal(lea.status, 412);
    assert.match(lea.headers['content-type'], /application\/problem\+json/);
    assert.notEqual((await request(app).get('/films/4')).body.titre, 'Autre titre');
  });
});

describe('Historique paginé par curseur', () => {
  test('une insertion pendant le parcours -> ni doublon ni saut (alors que l’offset doublonnerait)', async () => {
    const avant = (await request(app).get('/reservations?limit=100')).body.data.map((r) => r.id);

    // Page 1 de l'historique (les 5 plus récentes).
    const page1 = await request(app).get('/reservations?limit=5');
    const ids1 = page1.body.data.map((r) => r.id);
    assert.deepEqual(ids1, avant.slice(0, 5));

    // Pendant le parcours, une nouvelle réservation arrive : elle se place EN TÊTE de l'historique.
    const nouvelle = await reserver(2, ['A9']);

    // Page 2 en suivant links.next : elle reprend juste après le dernier élément vu.
    const page2 = await request(app).get(page1.body.links.next);
    const ids2 = page2.body.data.map((r) => r.id);
    assert.deepEqual(ids2, avant.slice(5, 10)); // ni saut
    assert.ok(ids2.every((id) => !ids1.includes(id))); // ni doublon
    assert.ok(!ids2.includes(nouvelle.body.id));

    // En offset (sauter 5 éléments), la nouvelle en tête aurait tout décalé d'un cran :
    // la page 2 aurait recommencé par le dernier élément de la page 1 (doublon).
    const apres = (await request(app).get('/reservations?limit=100')).body.data.map((r) => r.id);
    assert.equal(apres.slice(5, 10)[0], ids1[4]);
  });

  test('curseur illisible -> 400', async () => {
    const res = await request(app).get('/reservations?after=nimportequoi');
    assert.equal(res.status, 400);
  });
});
