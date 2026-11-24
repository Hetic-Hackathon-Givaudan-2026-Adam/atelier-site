/* =========================================================
   Givaudan Atelier — scripted demo scenario for "Créer un projet"
   Pure data: questions, chips, keyword dictionaries and the 3 blends.
   Read by js/assistant.js. Replaced by the RAG API later.
   ========================================================= */
window.AtelierScenario = (() => {
  "use strict";

  return {
    steps: {
      product: {
        message: (s) => `Bonjour ${s.firstName}. Parlons de votre projet. Quel produit souhaitez-vous parfumer ?`,
        chips: ["Parfum fin", "Soin du corps", "Bain & douche", "Maison", "Bougie", "Linge", "Autre"],
        multiple: false,
        placeholder: "Ex. : Un gel douche pour une nouvelle gamme destinée aux sportifs.",
      },
      ambiance: {
        message: (s) => /douche/i.test(s.product || "")
          ? "Quelle sensation voulez-vous offrir sous la douche ?"
          : "Quelle sensation voulez-vous offrir ?",
        chips: ["Fraîcheur", "Énergie", "Douceur", "Évasion", "Sensualité", "Je ne sais pas"],
        multiple: true,
        placeholder: "Ex. : Quelque chose de frais et tonique, avec des agrumes.",
      },
      constraints: {
        message: () => "Avez-vous des exigences particulières ?",
        chips: ["Naturel", "Vegan", "Sans allergène majeur", "Biodégradable", "Aucune"],
        multiple: true,
        placeholder: "Ex. : Une formule naturelle et vegan.",
      },
      intensity: {
        message: () => "Quelle intensité recherchez-vous ?",
        chips: ["Subtile", "Modérée", "Intense"],
        multiple: false,
        placeholder: "Décrivez votre projet…",
      },
      business: {
        message: () => "Dernière étape pour préparer votre échantillon :",
        groups: [
          { key: "market", label: "Marché", chips: ["France", "Europe", "Monde"] },
          { key: "volume", label: "Volume annuel estimé", chips: ["Moins d'1 t", "1 à 10 t", "Plus de 10 t"] },
          { key: "launch", label: "Lancement", chips: ["Moins de 6 mois", "6 à 12 mois", "Plus de 12 mois"] },
        ],
        placeholder: "Ex. : Europe, environ 5 tonnes, lancement dans 9 mois.",
      },
      reveal: {
        message: () => "Merci. Voici trois assemblages sélectionnés pour votre projet.",
        placeholder: "Une question sur ces assemblages ?",
      },
    },

    order: ["product", "ambiance", "constraints", "intensity", "business", "reveal"],

    /* defaults used when a free-text answer gives no usable keyword */
    defaults: {
      product: "Gel douche",
      ambiance: ["Énergie", "Fraîcheur"],
      constraints: ["Naturel", "Vegan"],
      intensity: "Modérée",
      market: "Europe",
      volume: "1 à 10 t",
      launch: "6 à 12 mois",
    },

    /* product chips → label shown on the project card */
    productChips: {
      "Parfum fin": "Parfum fin",
      "Soin du corps": "Soin du corps",
      "Bain & douche": "Bain & douche",
      "Maison": "Parfum d'ambiance",
      "Bougie": "Bougie",
      "Linge": "Soin du linge",
      "Autre": "Autre produit",
    },

    /* keyword dictionaries: [regex, value]. First match wins for single values. */
    keywords: {
      product: [
        [/gel[s]? douche|douche/i, "Gel douche"],
        [/shamp/i, "Shampooing"],
        [/savon/i, "Savon"],
        [/bain/i, "Bain & douche"],
        [/bougie/i, "Bougie"],
        [/lessive|adoucissant|linge/i, "Soin du linge"],
        [/diffuseur|ambiance|maison|spray d.int/i, "Parfum d'ambiance"],
        [/d[ée]odorant/i, "Déodorant"],
        [/cr[èe]me|lotion|lait|soin/i, "Soin du corps"],
        [/eau de (parfum|toilette)|parfum fin|parfum/i, "Parfum fin"],
      ],
      target: [
        [/sporti|sport/i, "Sportifs"],
        [/b[ée]b[ée]|enfant/i, "Enfants"],
        [/ado|jeune/i, "Jeunes adultes"],
        [/homme|masculin/i, "Hommes"],
        [/femme|f[ée]minin/i, "Femmes"],
        [/senior/i, "Seniors"],
        [/famil/i, "Familles"],
      ],
      ambiance: [
        [/fra[iî]ch|frais|fraîche|givr|agrume|citron|bergamote|marin|\bmer\b|oc[ée]an/i, "Fraîcheur"],
        [/[ée]nerg|tonique|dynam|vitalit|r[ée]veil|boost/i, "Énergie"],
        [/doux|douce|douceur|cocoon|r[ée]confort|apais/i, "Douceur"],
        [/[ée]vasion|voyage|exoti|vacance|soleil|[ée]t[ée]/i, "Évasion"],
        [/sensuel|s[ée]duct|chaleur|envo[uû]t/i, "Sensualité"],
        [/bois|c[eè]dre|santal|v[ée]tiver/i, "Boisé"],
        [/floral|fleur|\brose\b|jasmin|pivoine/i, "Floral"],
        [/gourmand|vanill|caramel|sucr/i, "Gourmand"],
        [/[ée]pic|cannelle|poivr/i, "Épicé"],
        [/ambr[ée]|oriental|r[ée]sine|encens/i, "Ambré"],
      ],
      constraints: [
        [/naturel|nature|bio\b|biologique/i, "Naturel"],
        [/vegan|v[ée]g[ée]tal/i, "Vegan"],
        [/allerg/i, "Sans allergène majeur"],
        [/biod[ée]grad/i, "Biodégradable"],
      ],
      noConstraint: /\b(aucune?|rien|pas d.exigence|non)\b/i,
      intensity: [
        [/subtil|l[ée]g[eè]r|discr[eè]t|d[ée]licat/i, "Subtile"],
        [/intens|fort|puissant|marqu[ée]/i, "Intense"],
        [/mod[ée]r|moyen|[ée]quilibr|normal/i, "Modérée"],
      ],
      market: [
        [/monde|international|global|export/i, "Monde"],
        [/europ/i, "Europe"],
        [/france|fran[cç]ais|national/i, "France"],
      ],
      /* notes mentioned directly in free text */
      notes: [
        [/agrume|citron|bergamote|orange|pamplemousse|mandarine/i, "Agrumes"],
        [/menthe/i, "Menthe"],
        [/\bverte?s?\b|herbe|feuille/i, "Notes vertes"],
        [/marin|\bmer\b|oc[ée]an/i, "Notes marines"],
        [/vanill/i, "Vanille"],
        [/c[eè]dre/i, "Bois de cèdre"],
        [/santal/i, "Santal"],
        [/v[ée]tiver/i, "Vétiver"],
        [/\brose\b/i, "Rose"],
        [/jasmin/i, "Jasmin"],
        [/caramel/i, "Caramel"],
        [/cannelle/i, "Cannelle"],
        [/musc/i, "Muscs blancs"],
      ],
    },

    /* ambiance → notes shown in "Notes pressenties" */
    ambianceNotes: {
      "Énergie": ["Agrumes", "Menthe"],
      "Fraîcheur": ["Notes vertes", "Agrumes"],
      "Douceur": ["Muscs blancs", "Fleur de coton", "Vanille"],
      "Évasion": ["Notes marines", "Fruits exotiques", "Fleur de tiaré"],
      "Sensualité": ["Ambre", "Bois de santal", "Vanille"],
      "Boisé": ["Bois de cèdre", "Vétiver", "Santal"],
      "Floral": ["Rose", "Jasmin", "Pivoine"],
      "Gourmand": ["Vanille", "Caramel", "Fève tonka"],
      "Épicé": ["Cannelle", "Cardamome", "Poivre"],
      "Ambré": ["Ambre", "Benjoin", "Vanille"],
      "Je ne sais pas": ["Agrumes", "Muscs blancs"],
    },
    maxNotes: 4,

    /* ---------------- "Modifier mon brief" ---------------- */
    edit: {
      ask: "Bien sûr. Que souhaitez-vous modifier ?",
      notUnderstood: "Je n'ai pas bien saisi. Que souhaitez-vous modifier ?",
      updated: "C'est noté. Voici les assemblages qui correspondent à votre brief mis à jour.",
      restartAll: "Reprenons votre brief.",
      // topic chips → step of the main scenario that is asked again
      topics: [
        ["Ambiance", "ambiance"],
        ["Exigences", "constraints"],
        ["Intensité", "intensity"],
        ["Marché, volume et lancement", "business"],
        ["Tout reprendre", "all"],
      ],
      // opening line when the edit starts from a pencil icon of the project card
      intro: {
        ambiance: "Modifions l'ambiance.",
        constraints: "Modifions vos exigences.",
        intensity: "Modifions l'intensité.",
        business: "Modifions le marché, le volume et le lancement.",
      },
      placeholder: "Ex. : Je voudrais quelque chose de plus boisé.",
      // free text naming a topic without a value ("changer l'intensité")
      topicWords: [
        [/ambiance|sensation|odeur|senteur|olfacti|\bnotes?\b/i, "ambiance"],
        [/exigence|contrainte|certif/i, "constraints"],
        [/intensit/i, "intensity"],
        [/march[ée]|volume|lancement|d[ée]lai|tonnage|quantit/i, "business"],
      ],
      restartWords: /tout (reprendre|recommencer|refaire)|depuis le d[ée]but|recommencer/i,
    },

    /* ---------------- blends after a modification ----------------
       dominant ambiance → olfactory direction → 3 blends (first = closest).
       Replaced by the RAG API later. */
    blendDirections: {
      "Fraîcheur": "frais", "Énergie": "frais", "Je ne sais pas": "frais",
      "Boisé": "boise",
      "Floral": "floral",
      "Douceur": "douceur", "Gourmand": "douceur",
      "Ambré": "oriental", "Épicé": "oriental", "Évasion": "oriental", "Sensualité": "oriental",
    },
    blendSets: {
      frais: ["menthe-givree", "brise-de-calabre", "ecume-marine"],
      boise: ["cedre-atlas", "santal-cremeux", "vetiver-fume"],
      floral: ["jardin-de-grasse", "nuit-de-jasmin", "petales-poudres"],
      douceur: ["ambre-dore", "coco-vanille", "caramel-beurre-sale"],
      oriental: ["ambre-dore", "encens-sacre", "route-des-epices"],
    },
    blendCatalog: [
      { id: "cedre-atlas", name: "Cèdre de l'Atlas", family: "Boisé – sec", top: "pamplemousse, cyprès", heart: "cèdre, poivre", base: "vétiver, ambre", tags: "Naturel à 90 %" },
      { id: "santal-cremeux", name: "Santal Crémeux", family: "Boisé – lacté", top: "cardamome", heart: "lait de figue, iris", base: "santal, musc", tags: "Vegan" },
      { id: "vetiver-fume", name: "Vétiver Fumé", family: "Boisé – fumé", top: "bergamote, poivre noir", heart: "vétiver, cuir", base: "patchouli, bois fumé", tags: "Conforme IFRA" },
      { id: "jardin-de-grasse", name: "Jardin de Grasse", family: "Floral – rosé", top: "litchi, bergamote", heart: "rose centifolia, pivoine", base: "musc, patchouli", tags: "Vegan" },
      { id: "nuit-de-jasmin", name: "Nuit de Jasmin", family: "Floral – fleurs blanches", top: "fleur d'oranger, mandarine", heart: "jasmin sambac, tubéreuse", base: "santal, vanille", tags: "Conforme IFRA" },
      { id: "petales-poudres", name: "Pétales Poudrés", family: "Floral – poudré", top: "bergamote, poire", heart: "iris, violette, rose", base: "héliotrope, musc blanc", tags: "Vegan" },
      { id: "ambre-dore", name: "Ambre Doré", family: "Oriental – ambré", top: "mandarine", heart: "labdanum, benjoin", base: "vanille, fève tonka", tags: "Conforme IFRA" },
      { id: "coco-vanille", name: "Douceur Coco-Vanille", family: "Gourmand – lacté", top: "noix de coco", heart: "fleur de tiaré", base: "vanille, musc", tags: "Vegan" },
      { id: "caramel-beurre-sale", name: "Caramel Beurre Salé", family: "Gourmand", top: "fleur de sel", heart: "caramel, beurre", base: "vanille, fève tonka", tags: "Conforme IFRA" },
      { id: "encens-sacre", name: "Encens Sacré", family: "Oriental – résineux", top: "élémi, poivre rose", heart: "encens, myrrhe", base: "ambre, bois de cèdre", tags: "Naturel à 90 %" },
      { id: "route-des-epices", name: "Route des Épices", family: "Oriental – épicé", top: "cardamome, orange", heart: "cannelle, clou de girofle", base: "ambre, patchouli", tags: "Conforme IFRA" },
    ],

    /* internal lead score, for the sales team only — never displayed */
    potential: {
      volume: { "Moins d'1 t": 0, "1 à 10 t": 1, "Plus de 10 t": 2 },
      launch: { "Moins de 6 mois": 1, "6 à 12 mois": 1, "Plus de 12 mois": 0 },
      market: { "France": 0, "Europe": 1, "Monde": 2 },
      // total ≥ 3 → élevé, 2 → moyen, otherwise faible
    },

    blends: [
      {
        id: "menthe-givree",
        name: "Menthe Givrée",
        family: "Frais – aromatique",
        top: "menthe poivrée, eucalyptus, citron vert",
        heart: "concombre, feuille de violette",
        base: "musc, vétiver",
        tags: "Naturel à 90 % · Vegan",
        match: "Très proche de votre brief",
      },
      {
        id: "brise-de-calabre",
        name: "Brise de Calabre",
        family: "Frais – hespéridé",
        top: "bergamote, citron, mandarine verte",
        heart: "néroli, thé vert",
        base: "muscs blancs, cèdre",
        tags: "Naturel à 85 % · Vegan",
      },
      {
        id: "ecume-marine",
        name: "Écume Marine",
        family: "Frais – marin",
        top: "notes marines, citron, menthe",
        heart: "algue, lavande",
        base: "bois flotté, ambre gris, musc",
        tags: "Vegan",
      },
    ],

    messages: {
      sampleConfirmed: "C'est noté. Votre échantillon est en préparation.",
      expert: (s) => s.existingClient
        ? "Bien sûr. Votre brief a été transmis à Claire Martin, votre interlocutrice dédiée. Elle vous recontacte sous 48 h."
        : "Bien sûr. Votre brief a été transmis à l'un de nos experts. Il vous recontacte sous 48 h.",
      revealHelp: "Vous pouvez demander un échantillon de l'un de ces assemblages, ou échanger avec un expert.",
      done: "Votre projet est enregistré. Vous le retrouverez dans Mes projets.",
    },

    defaultAddress: "12 rue de la Paix, 75002 Paris",
    orderBase: 147,
  };
})();
