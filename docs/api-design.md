# Conception de l'API Cinéma

## Ressources
- films          (id, titre, duree_min, classification)                     -> classification : TP, -12, -16, -18
- salles         (id, nom, capacite)                                         -> a un plan de salle (sieges)
- sieges         (id, salle_id, code, rangee, numero)                        -> sous-ressource de salles (code lisible : A12)
- seances        (id, film_id, salle_id, debut)                              -> référence films et salles
- clients        (id, nom, email)
- reservations   (id, seance_id, client_id, sieges[], statut, cree_le, expire_le) -> sous-ressource de seances
- paiements      (id, reservation_id, montant, statut, cree_le)              -> sous-ressource de reservations

## Opérations principales

| Opération | Méthode + URI | Succès | Erreurs prévues |
|---|---|---|---|
| Lister les films | `GET /films` | `200` | - |
| Lire un film | `GET /films/{id}` | `200` + `ETag` (`304` si `If-None-Match` à jour) | `404` |
| Créer un film | `POST /films` | `201` + `Location` | `400`, `422` |
| Remplacer un film | `PUT /films/{id}` (`If-Match` optionnel) | `200` | `400`, `404`, `412`, `422` |
| Modifier un film | `PATCH /films/{id}` (`If-Match` optionnel) | `200` | `400`, `404`, `412`, `422` |
| Supprimer un film | `DELETE /films/{id}` | `204` | `404` |
| Lister les séances (paginé, filtrable, triable) | `GET /seances?film=&date=&salle=&page=&limit=&tri=` | `200` | `400` |
| Lire une séance | `GET /seances/{id}` | `200` | `404` |
| Créer une séance | `POST /seances` | `201` + `Location` | `400`, `422` |
| Remplacer une séance | `PUT /seances/{id}` | `200` | `400`, `404`, `422` |
| Modifier une séance | `PATCH /seances/{id}` | `200` | `400`, `404`, `422` |
| Supprimer une séance | `DELETE /seances/{id}` | `204` | `404` |
| Plan de salle d'une séance (sièges libres / pris) | `GET /seances/{id}/sieges` | `200` + `ETag` (`304` si `If-None-Match` à jour) | `404` |
| Lister les réservations d'une séance | `GET /seances/{id}/reservations` | `200` | `404` |
| Réserver des sièges (hold de 10 min) | `POST /seances/{id}/reservations` | `201` + `Location` | `400`, `404`, `409`, `422` |
| Historique des réservations (curseur) | `GET /reservations?limit=&after=` | `200` | `400` |
| Lire une réservation | `GET /reservations/{id}` | `200` | `404` |
| Annuler une réservation | `PATCH /reservations/{id}` (`statut: cancelled`) | `200` | `404`, `409`, `422` |
| Confirmer et payer une réservation | `POST /reservations/{id}/confirmation` + `Idempotency-Key` | `200` | `400`, `404`, `409`, `422` |

## Choix de conception

- `films` et `salles` sont des collections de premier niveau et non des sous-ressources de `seances`, car un film ou une salle existe indépendamment d'une séance (un film peut être remplacé sur une séance sans que celle-ci disparaisse).
- `reservations` est une sous-ressource de `seances` (`seances/{id}/reservations`), car une réservation n'a pas de sens sans la séance à laquelle elle se rattache : si la séance est supprimée, la réservation l'est aussi.
- `paiements` est une sous-ressource de `reservations` (`reservations/{id}/paiements`) plutôt qu'une collection de premier niveau, car un paiement n'existe que s'il y a eu une réservation au préalable.
- Annuler une réservation = `PATCH /reservations/{id}` qui passe `statut` à `cancelled`, plutôt qu'un `POST /reservations/{id}/annuler` (verbe dans l'URI) ou qu'un `DELETE` (l'historique et le lien avec le paiement disparaîtraient).

## Modèle de données (esquisse)

Tables (kit de données fourni, chargé en mémoire depuis `data/seed.json`) :
- `films`, `salles`, `sieges`, `seances`, `clients`, `reservations`, `reservations_sieges`, `paiements`

Relations et cardinalités :
- une salle a N sièges (1-N) ; une salle accueille N séances (1-N)
- un film est projeté dans N séances (1-N)
- une séance a N réservations (1-N) ; un client a N réservations (1-N)
- une réservation porte sur N sièges et un siège est réservé N fois au fil des séances (N-N, via `reservations_sieges`)
- une réservation a N paiements (1-N : un paiement refusé puis un accepté, par exemple)

Stocké vs calculé :
- stocké : les données du kit ci-dessus, `statut` et `expire_le` d'une réservation (hold temporaire)
- calculé à la demande : les sièges libres d'une séance (sièges de la salle moins ceux des réservations `held` non expirées ou `confirmed`), le nombre de places restantes, l'heure de fin d'une séance (`debut` + `duree_min` du film)
- `reservations_sieges` n'est pas exposée comme collection : une ressource n'est pas une table. Elle apparaît dans l'API sous la forme du champ `sieges` d'une réservation (`"sieges": ["F12", "F13"]`).

## Erreurs et validation

### Format d'erreur unique
Toutes les erreurs sortent en `application/problem+json` (RFC 9457), produites par un handler central
(`src/errorHandler.js`) : les routes lèvent des erreurs typées (`src/errors.js`), elles ne construisent
jamais la réponse d'erreur.

| Erreur levée | Code | `type` (catégorie) |
|---|---|---|
| `BadRequestError` | `400` | `.../errors/bad-request` |
| `NotFoundError` | `404` | `.../errors/not-found` |
| `ConflictError` | `409` | `.../errors/conflict`, `.../errors/siege-indisponible`, `.../errors/confirmation-impossible` |
| `PreconditionFailedError` | `412` | `.../errors/precondition-failed` (`If-Match` obsolète) |
| `ValidationError` | `422` | `.../errors/validation` (+ extension `errors[]` : `{ field, message }`) |
| erreur imprévue | `500` | `.../errors/internal` : message générique, détail uniquement dans les logs serveur |

`title` résume la catégorie et ne change pas ; `detail` décrit le cas précis. Aucune *stack trace* n'est
renvoyée au client.

### Validation
Chaque `POST`, `PUT` et `PATCH` est validé avant la logique métier par un schéma déclaratif (zod) placé à
côté des routes. `PUT` exige tous les champs (la ressource est remplacée en entier) ; `PATCH` les accepte
tous optionnels, mais valides s'ils sont présents. En cas d'échec, tous les champs fautifs sont renvoyés
en une seule réponse.

- **`400`** : requête illisible. JSON invalide, `Content-Type: application/json` absent sur une écriture,
  paramètre de tri inconnu (`?tri=prix`).
- **`422`** : corps lisible mais invalide. Champ requis absent, mauvais type, durée ≤ 0, classification hors
  liste, date non ISO 8601, `film_id` ou `salle_id` qui ne désigne aucune ressource existante (ce n'est pas
  un `404` : l'URL `/seances` existe, c'est le contenu qui référence une ressource absente).
- **Champs inconnus : ignorés** (retirés du corps), y compris `id`, toujours attribué par le serveur.
  Choix tolérant envers les clients, cohérent avec la règle des extensions de problem+json.
- Paramètres de pagination non numériques ou hors bornes : ramenés à une valeur valide (page ≥ 1,
  1 ≤ limit ≤ 100) plutôt que refusés.

## Stratégie face au piège de concurrence

### Le piège
Deux clients visent le même siège d'une même séance au même moment : sans protection, le siège est vendu
deux fois. Variante : un client dont le réseau coupe renvoie sa confirmation, et paie deux fois. Enfin, deux
personnes qui modifient la même fiche en même temps : la seconde écrase la première sans le savoir.

### Ce que fait l'API
- **Hold temporaire** : `POST /seances/{id}/reservations` ne vend pas, il bloque les sièges 10 minutes
  (`statut: held`, `expire_le`). Le conflit est détecté dès le choix du siège, pas au paiement. Un hold expiré
  (constaté à la lecture, statut `expired`) ou annulé ne bloque plus rien.
- **Règle de conflit** : un siège est pris s'il appartient à une réservation `confirmed`, ou `held` non
  expirée. Sinon `409` `siege-indisponible` en problem+json. `409` et non `422` : la même requête réussira si
  le hold expire ou est annulé ; `422` est réservé aux demandes qui ne seront jamais valides (séance passée,
  siège absent du plan de salle).
- **Atomicité** : la vérification « sièges libres ? » et l'enregistrement du hold s'enchaînent sans aucune
  attente. Node exécute ce code d'un seul bloc sur un store en mémoire : aucune autre requête ne peut
  s'intercaler entre les deux, le premier arrivé gagne, le second reçoit `409`. Démontré par
  `npm run demo:concurrence` (deux requêtes parallèles -> un `201`, un `409`, une seule réservation active) et
  par les tests.
- **Confirmation idempotente** : `POST /reservations/{id}/confirmation` exige `Idempotency-Key`. Première
  fois : confirmation + paiement, réponse mémorisée sous la clé. Rejeu avec la même clé : même réponse
  (`Idempotent-Replayed: true`), aucun second paiement. Clé réutilisée pour une autre requête : `422`.
- **ETag** : sur le plan de salle (consulté en boucle) `If-None-Match` -> `304` tant qu'aucun siège ne
  change ; sur la fiche d'un film, `If-Match` -> `412` si elle a été modifiée depuis la lecture (concurrence
  optimiste : pas de verrou, pas de mise à jour perdue).
- **Curseur** : l'historique `GET /reservations` (plus récentes d'abord, tri stable `cree_le,id`) est paginé
  par curseur. Les nouvelles réservations arrivent en tête ; en offset elles décaleraient tout (doublons), le
  curseur reprend juste après le dernier élément vu. Les autres collections restent en offset.

### Pourquoi REST ici
Chaque réservation est une ressource stable avec son URI (`/reservations/261`), dont l'état (`held`,
`confirmed`, `expired`, `cancelled`) se lit et se change avec les verbes standard. Les situations de
concurrence ont des codes HTTP connus de tous les clients (`409`, `412`, `304`) et des en-têtes standard
(`ETag`, `If-Match`, `If-None-Match`, `Idempotency-Key`) : un client, un cache ou un proxy les comprend sans
lire notre documentation. Le cache HTTP natif (`304`) allège le plan de salle, la ressource la plus consultée.

### Conséquences
- Pour le client : générer une clé unique par confirmation et la répéter sur ses retries ; sur un `409`,
  proposer d'autres sièges (le plan de salle dit lesquels sont libres) ; sur un `412`, relire la ressource
  avant de réessayer ; confirmer dans les 10 minutes ; suivre `links.next` sans fabriquer le curseur.
- Ce qu'on ne gère pas : la persistance (tout est en mémoire, y compris les clés d'idempotence, sans
  expiration) ; plusieurs instances du serveur (l'atomicité repose sur un seul processus Node ; avec une base
  partagée il faudrait une contrainte d'unicité « un siège actif par séance » ou une transaction) ; le
  paiement réel (simulé, tarif unique) ; l'appartenance d'une réservation à son client (authentification,
  séance 6).
