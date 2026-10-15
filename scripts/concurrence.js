// Scénario reproductible du piège du sujet : deux clients visent le même siège AU MÊME MOMENT.
// Les deux requêtes HTTP partent en parallèle (Promise.all), sans attendre la réponse de l'autre.
// Attendu : un seul gagnant (201, hold), un 409 propre en problem+json, une seule réservation active.
// Lancement : npm run demo:concurrence
const app = require('../src/app');

const SEANCE = 725;
const SIEGE = 'F5';

const serveur = app.listen(0, async () => {
  const base = `http://localhost:${serveur.address().port}`;

  function reserver(nom, clientId) {
    return fetch(`${base}/seances/${SEANCE}/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, sieges: [SIEGE] }),
    }).then(async (res) => ({
      nom,
      status: res.status,
      contentType: res.headers.get('content-type'),
      corps: await res.json(),
    }));
  }

  console.log(`Alice et Bob réservent le siège ${SIEGE} de la séance ${SEANCE} au même moment...\n`);

  // Les deux requêtes sont envoyées en même temps.
  const resultats = await Promise.all([reserver('Alice', 1), reserver('Bob', 2)]);

  for (const r of resultats) {
    const resume = r.status === 201
      ? `hold n°${r.corps.id}, expire à ${r.corps.expire_le}`
      : `${r.contentType.split(';')[0]} · ${r.corps.title} · ${r.corps.detail}`;
    console.log(`  ${r.nom.padEnd(6)} -> ${r.status}  ${resume}`);
  }

  // Vérification de l'état : jamais deux réservations actives sur le même siège.
  const reservations = await (await fetch(`${base}/seances/${SEANCE}/reservations?limit=100`)).json();
  const actives = reservations.data.filter(
    (r) => (r.statut === 'held' || r.statut === 'confirmed') && r.sieges.includes(SIEGE),
  );
  const codes = resultats.map((r) => r.status).sort();

  console.log(`\nRéservations actives sur ${SIEGE} : ${actives.length}`);
  const ok = codes[0] === 201 && codes[1] === 409 && actives.length === 1;
  console.log(ok
    ? 'OK : un gagnant, un 409, aucun état incohérent.'
    : 'ÉCHEC : le siège a été réservé deux fois ou aucun gagnant.');

  serveur.close();
  process.exitCode = ok ? 0 : 1;
});
