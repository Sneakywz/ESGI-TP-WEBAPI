// Store en mémoire : les données du kit (data/seed.json) sont chargées au démarrage.
// Rien n'est écrit sur disque : un redémarrage remet les données d'origine.
// (La persistance n'est pas évaluée dans ce module.)
const seed = require('../data/seed.json');

// Copie des tables du kit : { films: [...], salles: [...], seances: [...], ... }
const db = structuredClone(seed.tables);

// Prochain identifiant libre d'une table (le plus grand id + 1).
function nextId(table) {
  return db[table].reduce((max, ligne) => Math.max(max, ligne.id), 0) + 1;
}

module.exports = { db, nextId };
