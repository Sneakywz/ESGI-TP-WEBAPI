// Handler d'erreur central : le seul endroit qui construit une réponse d'erreur.
// Toute erreur levée dans l'API arrive ici et repart en application/problem+json.
const { ApiError, BadRequestError, NotFoundError } = require('./errors');

// Route inconnue (ex. GET /toto) : placé après toutes les routes, il n'est atteint que si aucune n'a répondu.
function routeInconnue(req, res, next) {
  next(new NotFoundError(`Aucune ressource à l'adresse ${req.method} ${req.path}.`));
}

// Express reconnaît un middleware d'erreur à ses 4 paramètres (err, req, res, next).
function errorHandler(err, req, res, next) {
  let erreur = err;

  if (err.type === 'entity.parse.failed') {
    // JSON illisible, détecté par express.json() : 400.
    erreur = new BadRequestError("Le corps de la requête n'est pas un JSON valide.");
  } else if (!(err instanceof ApiError) && err.status >= 400 && err.status < 500) {
    // Autres erreurs de lecture du corps signalées par Express (ex. corps trop volumineux).
    erreur = new ApiError(err.status, 'bad-request', 'Requête mal formée', 'Le corps de la requête ne peut pas être lu.');
  } else if (!(err instanceof ApiError)) {
    // Erreur imprévue (bug) : le détail va dans les logs du serveur, jamais dans la réponse.
    console.error(err);
    erreur = new ApiError(500, 'internal', 'Erreur interne', 'Une erreur inattendue est survenue.');
  }

  res
    .status(erreur.status)
    .type('application/problem+json')
    .json(erreur.toProblem(req.originalUrl));
}

module.exports = { routeInconnue, errorHandler };
