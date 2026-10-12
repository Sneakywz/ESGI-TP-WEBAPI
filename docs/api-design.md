## Ressources
- films          (id, titre, duree_min, genre, annee)
- salles         (id, nom, capacite)
- seances        (id, film_id, salle_id, debut)                              -> référence films et salles
- reservations   (id, seance_id, client, sieges[], statut)                   -> sous-ressource de seances
- paiements      (id, reservation_id, montant, moyen, statut)                -> sous-ressource de reservations

## Opérations principales

| Opération | Méthode + URI | Succès | Erreurs prévues |
|---|---|---|---|
| Lister les films | `GET /films` | `200` | - |
| Lire un film | `GET /films/{id}` | `200` | `404` |
| Créer un film | `POST /films` | `201` + `Location` | `400`, `422` |
| Créer une séance | `POST /seances` | `201` + `Location` | `400`, `422` |
| Lister les réservations d'une séance | `GET /seances/{id}/reservations` | `200` | `404` |
| Réserver une place | `POST /seances/{id}/reservations` | `201` + `Location` | `404`, `409` |
| Lire une réservation | `GET /reservations/{id}` | `200` | `404` |
| Payer une réservation | `POST /reservations/{id}/paiements` | `201` + `Location` | `404`, `422` |

## Choix de conception

- `films` et `salles` sont des collections de premier niveau et non des sous-ressources de `seances`, car un film ou une salle existe indépendamment d'une séance (un film peut être remplacé sur une séance sans que celle-ci disparaisse).
- `reservations` est une sous-ressource de `seances` (`seances/{id}/reservations`), car une réservation n'a pas de sens sans la séance à laquelle elle se rattache : si la séance est supprimée, la réservation l'est aussi.
- `paiements` est une sous-ressource de `reservations` (`reservations/{id}/paiements`) plutôt qu'une collection de premier niveau, car un paiement n'existe que s'il y a eu une réservation au préalable.