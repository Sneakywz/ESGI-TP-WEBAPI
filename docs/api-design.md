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
| Lire un film | `GET /films/{id}` | `200` | `404` |
| Créer un film | `POST /films` | `201` + `Location` | `400`, `422` |
| Remplacer un film | `PUT /films/{id}` | `200` | `400`, `404`, `422` |
| Modifier un film | `PATCH /films/{id}` | `200` | `400`, `404`, `422` |
| Supprimer un film | `DELETE /films/{id}` | `204` | `404` |
| Lister les séances (paginé, filtrable, triable) | `GET /seances?film=&date=&salle=&page=&limit=&tri=` | `200` | `400` |
| Lire une séance | `GET /seances/{id}` | `200` | `404` |
| Créer une séance | `POST /seances` | `201` + `Location` | `400`, `422` |
| Remplacer une séance | `PUT /seances/{id}` | `200` | `400`, `404`, `422` |
| Modifier une séance | `PATCH /seances/{id}` | `200` | `400`, `404`, `422` |
| Supprimer une séance | `DELETE /seances/{id}` | `204` | `404` |
| Lister les réservations d'une séance | `GET /seances/{id}/reservations` | `200` | `404` |
| Réserver des sièges | `POST /seances/{id}/reservations` | `201` + `Location` | `400`, `404`, `409`, `422` |
| Lire une réservation | `GET /reservations/{id}` | `200` | `404` |
| Annuler une réservation | `PATCH /reservations/{id}` (`statut: cancelled`) | `200` | `404`, `422` |
| Payer une réservation | `POST /reservations/{id}/paiements` | `201` + `Location` | `404`, `422` |

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
