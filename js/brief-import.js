/* Validation locale des fichiers, extraction par l’API et résumé du brief. */
window.AtelierBriefImport = (() => {
  "use strict";

  const MAX_BYTES = 10 * 1024 * 1024; // 10 Mo
  const EXTENSIONS = ["pdf", "docx", "txt"]; // the old .doc format is not readable
  const ACCEPT = ".pdf,.docx,.txt";
  const FORMATS_LINE = "PDF, Word (.docx) ou texte — 10 Mo maximum";
  const API_EXAMPLE = { name: "Brief_Gel-douche_AquaSport.txt", url: "assets/brief-exemple.txt" };

  // the example shown in the file chip: a real text file when the API answers
  const example = () => ({ name: API_EXAMPLE.name, size: 1400 });

  // French error message, or null when the file can be analysed
  function validateFile(file) {
    const ext = String(file.name || "").split(".").pop().toLowerCase();
    if (!EXTENSIONS.includes(ext) || !String(file.name).includes(".")) {
      return "Ce format n'est pas pris en charge. Déposez un PDF, un fichier Word (.docx) ou un texte.";
    }
    if (file.size === 0) return "Ce fichier est vide.";
    if (file.size > MAX_BYTES) return "Ce fichier dépasse 10 Mo.";
    return null;
  }

  // 254 Ko · 1,2 Mo
  function formatSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
  }


  async function exampleFile() {
    const res = await fetch(API_EXAMPLE.url);
    if (!res.ok) throw new Error(`example ${res.status}`);
    const blob = await res.blob();
    return new File([blob], API_EXAMPLE.name, { type: "text/plain" });
  }

  async function analyzeBrief(file) {
    try {
      return await AtelierAPI.importBrief(file || await exampleFile());
    } catch (error) {
      return { error: error.message };
    }
  }

  /* ---------------- summary rewritten from the current fields ----------------
     Used once the customer edits the review card. Later the RAG API can return
     a rewritten summary instead. */
  const ADJECTIVES = {
    "Énergie": "énergisante", "Fraîcheur": "fraîche", "Douceur": "douce", "Évasion": "évasive",
    "Sensualité": "sensuelle", "Boisé": "boisée", "Floral": "florale", "Gourmand": "gourmande",
    "Épicé": "épicée", "Ambré": "ambrée",
  };
  const NOTE_ARTICLES = {
    "agrumes": "des agrumes", "menthe": "de la menthe", "notes vertes": "des notes vertes",
    "bois de cèdre": "du bois de cèdre", "vétiver": "du vétiver", "santal": "du santal",
    "bois de santal": "du bois de santal", "vanille": "de la vanille", "rose": "de la rose",
    "jasmin": "du jasmin", "pivoine": "de la pivoine", "caramel": "du caramel",
    "fève tonka": "de la fève tonka", "cannelle": "de la cannelle", "cardamome": "de la cardamome",
    "poivre": "du poivre", "ambre": "de l'ambre", "benjoin": "du benjoin", "muscs blancs": "des muscs blancs",
    "fleur de coton": "de la fleur de coton", "notes marines": "des notes marines",
    "fruits exotiques": "des fruits exotiques", "fleur de tiaré": "de la fleur de tiaré",
    "fleur d'oranger": "de la fleur d'oranger", "amande": "de l'amande", "notes poudrées": "des notes poudrées",
  };
  const CONSTRAINT_WORDS = { "Naturel": "naturelle", "Vegan": "vegan", "Biodégradable": "biodégradable", "Sans allergène majeur": "sans allergène majeur" };
  const FEMININE = /^(bougie|crème|lessive|lotion|eau|huile|brume|poudre|mousse|lingette)/i;

  // "a, b et c"
  const joinFr = (list) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} et ${list[list.length - 1]}` : list[0] || "");
  const noteWithArticle = (note) => {
    const n = note.toLowerCase();
    return NOTE_ARTICLES[n] || (/^[aeiouyhéèêàâîôû]/i.test(n) ? `de l'${n}` : `de ${n}`);
  };

  // voice "client" (default): "Vous recherchez…" · voice "sales" (Espace commercial): "Le client recherche…"
  function buildBriefSummary(fields = {}, { voice = "client" } = {}) {
    const product = (fields.product || "produit").toLowerCase();
    const feminine = FEMININE.test(product);
    let first = `${feminine ? "Une" : "Un"} ${product}`;
    if (fields.target) first += ` pour ${fields.target.toLowerCase()}`;
    if (fields.market) {
      const where = fields.market === "Monde" ? "dans le monde entier" : `en ${fields.market}`;
      first += `, ${feminine ? "vendue" : "vendu"} ${where}`;
    }

    const adjectives = (fields.ambiance || []).map((a) => ADJECTIVES[a]).filter(Boolean);
    const notes = (fields.notes || []).slice(0, 2).map(noteWithArticle);
    const constraints = (fields.constraints || []).filter((c) => c !== "Aucune").map((c) => CONSTRAINT_WORDS[c] || c.toLowerCase());
    let second = "";
    if (adjectives.length || notes.length || constraints.length) {
      second = `${voice === "sales" ? "Le client recherche" : "Vous recherchez"} une fragrance${adjectives.length ? ` ${joinFr(adjectives)}` : ""}`;
      if (notes.length) second += `${adjectives.length ? "," : ""} autour ${notes.join(" et ")}`;
      if (constraints.length) second += `, avec une formule ${joinFr(constraints)}`;
      second += ".";
    }
    return `${first}.${second ? ` ${second}` : ""}`;
  }

  return { analyzeBrief, buildBriefSummary, validateFile, formatSize, MAX_BYTES, ACCEPT, FORMATS_LINE, example,
    get EXAMPLE() { return example(); } };
})();
