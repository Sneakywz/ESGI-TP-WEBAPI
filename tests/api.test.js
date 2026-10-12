// Tests d'intégration HTTP : de vraies requêtes envoyées à l'API (via supertest),
// qui traversent toute la chaîne : routage, validation, handler d'erreur.
// Lancement : npm test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');

// Vérifie qu'une réponse d'erreur respecte le format problem+json (RFC 9457).
function verifierProblem(res, status) {
  assert.equal(res.status, status);
  assert.match(res.headers['content-type'], /application\/problem\+json/);
  assert.equal(res.body.status, status);
  assert.ok(res.body.type, 'champ type présent');
  assert.ok(res.body.title, 'champ title présent');
}

describe('Cas nominaux', () => {
  test('POST /films valide -> 201 + Location exploitable', async () => {
    const res = await request(app)
      .post('/films')
      .send({ titre: 'Dune 3', duree_min: 150, classification: 'TP' });

    assert.equal(res.status, 201);
    assert.equal(res.headers.location, `/films/${res.body.id}`);

    // Le Location mène bien au film créé.
    const lecture = await request(app).get(res.headers.location);
    assert.equal(lecture.status, 200);
    assert.equal(lecture.body.titre, 'Dune 3');
  });

  test('GET /seances -> 200 + enveloppe data / pagination / links', async () => {
    const res = await request(app).get('/seances?page=2&limit=10');

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 10);
    assert.deepEqual(res.body.pagination, { page: 2, limit: 10, total: 1008 });
    assert.equal(res.body.links.next, '/seances?page=3&limit=10');
    assert.equal(res.body.links.prev, '/seances?page=1&limit=10');
  });

  test('GET /seances filtré : filtres combinables', async () => {
    const res = await request(app).get('/seances?film=18&salle=2');

    assert.equal(res.status, 200);
    assert.equal(res.body.pagination.total, 12);
    assert.ok(res.body.data.every((s) => s.film_id === 18 && s.salle_id === 2));
  });

  test('GET /seances?tri=debut -> tri stable (id ajouté en départage)', async () => {
    // Les 4 premières séances commencent à la même heure : sans départage, leur ordre ne serait pas garanti.
    const res = await request(app).get('/seances?tri=debut&limit=4');

    assert.deepEqual(res.body.data.map((s) => s.id), [1, 4, 7, 10]);
  });

  test('PATCH /films/:id ne modifie que les champs fournis', async () => {
    const avant = (await request(app).get('/films/5')).body;
    const res = await request(app).patch('/films/5').send({ duree_min: 999 });

    assert.equal(res.status, 200);
    assert.equal(res.body.duree_min, 999);
    assert.equal(res.body.titre, avant.titre);
  });

  test('DELETE /films/:id -> 204, puis 404 au second appel', async () => {
    const creation = await request(app)
      .post('/films')
      .send({ titre: 'À supprimer', duree_min: 90, classification: '-12' });

    const suppression = await request(app).delete(creation.headers.location);
    assert.equal(suppression.status, 204);

    const deuxiemeSuppression = await request(app).delete(creation.headers.location);
    verifierProblem(deuxiemeSuppression, 404);
  });
});

describe("Cas d'erreur", () => {
  test('POST /films invalide -> 422 avec TOUS les champs fautifs', async () => {
    const res = await request(app)
      .post('/films')
      .send({ titre: '', duree_min: -50, classification: 'pour adultes' });

    verifierProblem(res, 422);
    assert.deepEqual(
      res.body.errors.map((e) => e.field),
      ['titre', 'duree_min', 'classification'],
    );
  });

  test('JSON illisible -> 400 (et non 422)', async () => {
    const res = await request(app)
      .post('/films')
      .set('Content-Type', 'application/json')
      .send('{"titre": ');

    verifierProblem(res, 400);
  });

  test('Content-Type absent -> 400', async () => {
    const res = await request(app)
      .post('/films')
      .set('Content-Type', 'text/plain')
      .send('titre=Dune');

    verifierProblem(res, 400);
  });

  test('GET /seances/9999 -> 404', async () => {
    const res = await request(app).get('/seances/9999');

    verifierProblem(res, 404);
    assert.equal(res.body.instance, '/seances/9999');
  });

  test('POST /seances avec un film inexistant -> 422 (pas 404)', async () => {
    const res = await request(app)
      .post('/seances')
      .send({ film_id: 999, salle_id: 1, debut: '2026-12-24T20:00:00Z' });

    verifierProblem(res, 422);
    assert.equal(res.body.errors[0].field, 'film_id');
  });

  test('DELETE /films/:id encore projeté -> 409', async () => {
    const res = await request(app).delete('/films/3');

    verifierProblem(res, 409);
  });

  test('GET /seances?tri=prix -> 400', async () => {
    const res = await request(app).get('/seances?tri=prix');

    verifierProblem(res, 400);
  });
});
