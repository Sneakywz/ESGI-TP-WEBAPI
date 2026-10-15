// Requêtes conditionnelles : ETag, If-None-Match (cache, 304) et If-Match (concurrence optimiste, 412).
const crypto = require('node:crypto');
const { PreconditionFailedError } = require('./errors');

// L'ETag est une empreinte du contenu : il change dès que la ressource change (son "numéro de version").
function etagDe(ressource) {
  const empreinte = crypto.createHash('sha1').update(JSON.stringify(ressource)).digest('base64url');
  return `"${empreinte.slice(0, 16)}"`;
}

// Valeur d'une étiquette sans le préfixe W/ ni les guillemets (le client peut les omettre).
function nettoyer(etiquette) {
  return etiquette.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
}

// Liste des étiquettes d'un en-tête If-Match / If-None-Match (ex. "abc", W/"def").
function etiquettes(entete) {
  return (entete ?? '').split(',').map(nettoyer).filter(Boolean);
}

// Lecture : envoie la ressource avec son ETag ; si le client a déjà cette version (If-None-Match),
// répond 304 Not Modified sans corps.
function repondreAvecEtag(req, res, ressource) {
  const etag = etagDe(ressource);
  res.set('ETag', etag);
  const connues = etiquettes(req.get('If-None-Match'));
  if (connues.includes(nettoyer(etag)) || connues.includes('*')) {
    return res.status(304).end();
  }
  return res.json(ressource);
}

// Écriture : si le client envoie If-Match, la ressource doit toujours être dans la version qu'il a lue,
// sinon 412 Precondition Failed (quelqu'un l'a modifiée entre-temps : pas de mise à jour perdue).
// Sans If-Match, l'écriture est acceptée (en-tête optionnel).
function verifierIfMatch(req, ressource) {
  const attendues = etiquettes(req.get('If-Match'));
  if (attendues.length === 0 || attendues.includes('*')) return;
  if (!attendues.includes(nettoyer(etagDe(ressource)))) {
    throw new PreconditionFailedError(
      'La ressource a été modifiée depuis votre lecture (ETag différent). Relisez-la puis réessayez.',
    );
  }
}

module.exports = { etagDe, repondreAvecEtag, verifierIfMatch };
