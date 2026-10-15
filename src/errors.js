// Erreurs typées de l'API.
// Les routes lèvent ces erreurs (throw) au lieu de construire la réponse elles-mêmes :
// le handler central (errorHandler.js) les transforme en application/problem+json (RFC 9457).

// Préfixe des URLs de "type" : une URL stable par catégorie d'erreur.
const TYPE_BASE = 'https://api-cinema.exemple/errors/';

class ApiError extends Error {
  // status : code HTTP ; categorie : fin de l'URL "type" ; title : résumé stable de la catégorie ;
  // detail : explication de ce cas précis ; extensions : champs en plus (ex. errors[] pour la validation)
  constructor(status, categorie, title, detail, extensions = {}) {
    super(detail);
    this.status = status;
    this.type = TYPE_BASE + categorie;
    this.title = title;
    this.detail = detail;
    this.extensions = extensions;
  }

  // Corps de la réponse problem+json.
  toProblem(instance) {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.detail,
      instance,
      ...this.extensions,
    };
  }
}

// 400 : la requête est mal formée, le serveur ne peut pas la lire (JSON cassé, paramètre illisible).
class BadRequestError extends ApiError {
  constructor(detail) {
    super(400, 'bad-request', 'Requête mal formée', detail);
  }
}

// 404 : la ressource désignée par l'URL n'existe pas.
class NotFoundError extends ApiError {
  constructor(detail) {
    super(404, 'not-found', 'Ressource introuvable', detail);
  }
}

// 409 : la requête est valide, mais l'état actuel de la ressource l'empêche.
// Une catégorie plus précise peut être donnée (ex. siege-indisponible).
class ConflictError extends ApiError {
  constructor(detail, categorie = 'conflict', title = "Conflit avec l'état actuel") {
    super(409, categorie, title, detail);
  }
}

// 412 : la requête porte If-Match, mais la ressource a changé depuis que le client l'a lue.
class PreconditionFailedError extends ApiError {
  constructor(detail) {
    super(412, 'precondition-failed', 'Version obsolète', detail);
  }
}

// 422 : le corps est lisible mais invalide ; errors[] liste TOUS les champs fautifs.
class ValidationError extends ApiError {
  constructor(errors) {
    super(422, 'validation', 'Requête invalide', `${errors.length} champ(s) invalide(s).`, { errors });
  }
}

module.exports = {
  ApiError, BadRequestError, NotFoundError, ConflictError, PreconditionFailedError, ValidationError,
};
