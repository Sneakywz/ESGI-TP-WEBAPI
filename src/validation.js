// Validation des écritures (POST, PUT, PATCH), avant la logique métier.
const { z } = require('zod');
const { BadRequestError, ValidationError } = require('./errors');

// Messages d'erreur par défaut de zod en français.
z.config(z.locales.fr());

// Sans Content-Type: application/json, le serveur ne sait pas lire le corps : 400.
function exigerJson(req, res, next) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
    throw new BadRequestError('En-tête Content-Type: application/json attendu.');
  }
  next();
}

// Middleware placé devant une route : vérifie req.body avec le schéma.
// En cas d'échec, lève une ValidationError (422) qui liste TOUS les champs fautifs d'un coup.
// Les champs inconnus du schéma sont retirés (choix documenté : ils sont ignorés).
function valider(schema) {
  return (req, res, next) => {
    const corps = req.body ?? {};
    const resultat = schema.safeParse(corps);
    if (!resultat.success) {
      const errors = resultat.error.issues.map((issue) => {
        const absent = issue.path.length === 1 && corps[issue.path[0]] === undefined;
        return {
          field: issue.path.join('.') || '(corps)',
          message: absent ? 'champ requis' : issue.message,
        };
      });
      throw new ValidationError(errors);
    }
    req.body = resultat.data;
    next();
  };
}

module.exports = { z, exigerJson, valider };
