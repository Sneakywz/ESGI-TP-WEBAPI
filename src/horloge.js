// L'heure courante de l'API, isolée dans un module :
// les tests peuvent remplacer horloge.maintenant pour "avancer le temps" (ex. faire expirer un hold).
const horloge = {
  maintenant: () => new Date(),
};

module.exports = horloge;
