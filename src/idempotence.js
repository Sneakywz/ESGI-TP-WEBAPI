// Clé d'idempotence (en-tête Idempotency-Key) : rend un POST rejouable sans effet en double.
// Le client génère une clé unique par intention et la renvoie à chaque retry.
//  - première fois : la requête est traitée et sa réponse mémorisée sous la clé ;
//  - même clé reçue à nouveau : la réponse mémorisée est renvoyée, rien n'est retraité.
const { BadRequestError, ValidationError } = require('./errors');

// clé -> { requete, status, contentType, corps } (en mémoire, comme le reste du store)
const reponsesMemorisees = new Map();

function idempotent(req, res, next) {
  const cle = req.get('Idempotency-Key');
  if (!cle) {
    throw new BadRequestError('En-tête Idempotency-Key requis (une clé unique par intention, répétée sur les retries).');
  }

  // La clé désigne UNE intention : la réutiliser pour une autre requête est une erreur du client.
  const requete = `${req.method} ${req.originalUrl}`;
  const deja = reponsesMemorisees.get(cle);
  if (deja) {
    if (deja.requete !== requete) {
      throw new ValidationError([{ field: 'Idempotency-Key', message: `clé déjà utilisée pour ${deja.requete}` }]);
    }
    // Rejeu : on renvoie exactement la même réponse, sans retraiter.
    return res.status(deja.status).type(deja.contentType).set('Idempotent-Replayed', 'true').send(deja.corps);
  }

  // Première fois : on laisse la route (ou le handler d'erreur) répondre, et on mémorise la réponse.
  // Les erreurs serveur (5xx) ne sont pas mémorisées : un retry doit pouvoir réussir.
  const jsonOriginal = res.json.bind(res);
  res.json = (corps) => {
    if (res.statusCode < 500) {
      reponsesMemorisees.set(cle, {
        requete,
        status: res.statusCode,
        contentType: res.get('Content-Type') ?? 'application/json',
        corps: JSON.stringify(corps),
      });
    }
    return jsonOriginal(corps);
  };
  next();
}

module.exports = { idempotent };
