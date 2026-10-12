// Pagination offset commune à toutes les collections.
// Découpe une liste déjà filtrée et triée, et l'emballe dans l'enveloppe :
// { data, pagination: { page, limit, total }, links: { next, prev } }
const LIMIT_PAR_DEFAUT = 20;
const LIMIT_MAX = 100;

function paginer(elements, query, chemin) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(LIMIT_MAX, Math.max(1, parseInt(query.limit, 10) || LIMIT_PAR_DEFAUT));

  // offset = nombre d'éléments sautés avant la page demandée
  const offset = (page - 1) * limit;
  const total = elements.length;

  // Lien vers une autre page, en gardant les autres paramètres (filtres, tri).
  function lienVersPage(numero) {
    const params = new URLSearchParams(query);
    params.set('page', numero);
    params.set('limit', limit);
    return `${chemin}?${params}`;
  }

  return {
    data: elements.slice(offset, offset + limit),
    pagination: { page, limit, total },
    links: {
      next: offset + limit < total ? lienVersPage(page + 1) : null,
      prev: page > 1 ? lienVersPage(page - 1) : null,
    },
  };
}

module.exports = { paginer };
