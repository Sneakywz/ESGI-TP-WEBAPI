// Démarrage du serveur HTTP.
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API Cinéma démarrée sur http://localhost:${PORT}`);
});
