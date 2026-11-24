/* =========================================================
   Givaudan Atelier — sample projects of the demo
   Same structure as the projects saved by "Créer un projet" (js/store.js).
   Mes projets is rendered from Store.listProjects(): samples and saved
   projects merged BY ID — a saved project with the same id (e.g. after
   "Reprendre") replaces the sample, so each project appears only once.
   "Réinitialiser la démo" clears the saved data → the samples come back.

   Display-only fields: cardBlend (blend line on the card when no blend is
   chosen yet), pendingText (card line when there is no blend at all).
   ========================================================= */
window.AtelierSamples = [
  {
    id: "sample-gel-douche-sport-intense",
    name: "Gel douche Sport Intense",
    product: "Gel douche",
    status: "shipped", // Échantillon expédié
    created: "2026-10-28T10:00:00",
    date: "2026-11-18T10:00:00",
    brief: {
      target: "Sportifs",
      ambiance: ["Énergie", "Fraîcheur"],
      notes: ["Agrumes", "Notes vertes", "Thé vert"],
      constraints: ["Vegan"],
      intensity: "Intense",
      market: "Europe",
      volume: "Plus de 10 t",
      launch: "Moins de 6 mois",
    },
    potential: "élevé", // internal — never displayed
    blends: [],
    favorite: null,
    blend: { id: "brise-de-calabre", name: "Brise de Calabre", notes: "Bergamote de Calabre · Néroli · Thé vert" },
    contact: "Claire Martin",
  },
  {
    id: "sample-bougie-cocooning",
    name: "Bougie Cocooning",
    product: "Bougie",
    status: "proposed", // Assemblages proposés
    created: "2026-11-03T10:00:00",
    date: "2026-11-15T10:00:00", // last update
    brief: {
      target: "Intérieur cosy",
      ambiance: ["Douceur", "Évasion"],
      notes: ["Vanille", "Ambre", "Bois doux"],
      constraints: ["Biodégradable"],
      intensity: "Intense",
      market: "France",
      volume: "1 à 10 t",
      launch: "6 à 12 mois",
    },
    potential: "moyen", // internal, for the sales team — never displayed
    blends: [
      {
        id: "ambre-dore",
        name: "Ambre Doré",
        family: "Oriental – ambré",
        top: "mandarine",
        heart: "labdanum, benjoin",
        base: "vanille, fève tonka",
        tags: "Conforme IFRA",
        match: "Très proche de votre brief",
      },
      {
        id: "santal-cremeux",
        name: "Santal Crémeux",
        family: "Boisé – lacté",
        top: "cardamome",
        heart: "lait de figue, iris",
        base: "santal, musc",
        tags: "Vegan · Conforme IFRA",
      },
      {
        id: "encens-sacre",
        name: "Encens Sacré",
        family: "Oriental – résineux",
        top: "élémi, poivre rose",
        heart: "encens, myrrhe",
        base: "ambre, bois de cèdre",
        tags: "Naturel à 90 %",
      },
    ],
    favorite: "ambre-dore",
    blend: null,
    cardBlend: { name: "Ambre Doré", notes: "Benjoin · Labdanum · Vanille" },
    contact: "Claire Martin",
  },
  {
    id: "sample-creme-mains-bio",
    name: "Crème mains Bio",
    product: "Crème mains",
    status: "expert", // Transmis à un expert
    created: "2026-11-05T10:00:00",
    date: "2026-11-12T10:00:00",
    brief: {
      target: "Peaux sensibles",
      ambiance: ["Douceur"],
      notes: ["Fleur d'oranger", "Amande", "Notes poudrées"],
      constraints: ["Naturel", "Sans allergène majeur"],
      intensity: "Subtile",
      market: "France",
      volume: "Moins d'1 t",
      launch: "Moins de 6 mois",
    },
    potential: "faible", // internal — never displayed
    blends: [],
    favorite: null,
    blend: null,
    contact: "Claire Martin",
    pendingText: "Brief en cours d'étude par nos experts",
    expertNote: "Aucun assemblage ne convenait : brief transmis à Claire Martin le 12 novembre 2026.",
  },
  {
    id: "sample-lessive-fraicheur",
    name: "Lessive Fraîcheur",
    product: "Lessive",
    status: "done", // Terminé
    created: "2026-07-15T10:00:00",
    date: "2026-10-02T10:00:00",
    brief: {
      target: "Familles",
      ambiance: ["Fraîcheur", "Douceur"],
      notes: ["Fleur de coton", "Muscs blancs", "Lavande"],
      constraints: ["Biodégradable"],
      intensity: "Modérée",
      market: "France",
      volume: "Plus de 10 t",
      launch: "6 à 12 mois",
    },
    potential: "élevé", // internal — never displayed
    blends: [],
    favorite: null,
    blend: { id: "linge-au-soleil", name: "Linge au Soleil", notes: "Fleur de coton · Muscs blancs · Lavande" },
    contact: "Claire Martin",
  },
];

/* sample orders live in js/orders.js (shared by Mes commandes and Mes projets) */
