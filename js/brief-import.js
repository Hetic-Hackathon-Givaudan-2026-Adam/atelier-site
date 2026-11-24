/* =========================================================
   Givaudan Atelier — brief import ("Importer mon brief")

   ONE entry point:  await analyzeBrief(file)
     file   a File from the drop zone / file input, or null for the demo
            example ("Brief_Gel-douche_AquaSport.pdf")
   returns { fileName, summary, projectName,
             fields: { product, target, ambiance[], notes[], constraints[],
                       intensity, market, volume, launch },
             found: [field keys read in the document],
             missing: [field keys still unknown] }

   With the local RAG API (js/api.js): the file is sent to
   POST /atelier/brief/import (read in memory on this computer, never stored).
   The example sends assets/brief-exemple.txt. A refused document (413 / 415 /
   422) returns { error: "<French message>" }: shown in the drop zone, no
   simulation. Network error / timeout → the scripted result below.
   In simulation (API unreachable, published page): the scripted demo brief,
   whatever the file (nothing is uploaded: the document stays in the browser).
   ========================================================= */
window.AtelierBriefImport = (() => {
  "use strict";

  const MAX_BYTES = 10 * 1024 * 1024; // 10 Mo
  const EXTENSIONS = ["pdf", "docx", "txt"]; // the old .doc format is not readable
  const ACCEPT = ".pdf,.docx,.txt";
  const FORMATS_LINE = "PDF, Word (.docx) ou texte — 10 Mo maximum";
  const SIMULATED_EXAMPLE = { name: "Brief_Gel-douche_AquaSport.pdf", size: 254 * 1024 };
  const API_EXAMPLE = { name: "Brief_Gel-douche_AquaSport.txt", url: "assets/brief-exemple.txt" };
  const FIELD_KEYS = ["product", "target", "ambiance", "notes", "constraints", "intensity", "market", "volume", "launch"];

  const connected = () => Boolean(window.AtelierAPI && window.AtelierAPI.status === "connected");
  // the example shown in the file chip: a real text file when the API answers
  const example = () => (connected() ? { name: API_EXAMPLE.name, size: 1400 } : SIMULATED_EXAMPLE);

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

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  async function exampleFile() {
    const res = await fetch(API_EXAMPLE.url);
    if (!res.ok) throw new Error(`example ${res.status}`);
    const blob = await res.blob();
    return new File([blob], API_EXAMPLE.name, { type: "text/plain" });
  }

  async function analyzeBrief(file) {
    const API = window.AtelierAPI;
    if (API && (await API.ready())) {
      try {
        const sent = file || (await exampleFile());
        return await API.importBrief(sent); // result, or { error } shown in the drop zone
      } catch (err) {
        console.info("[Atelier] IA locale sans réponse pour ce brief : simulation.");
        API.markDown();
      }
    }
    return simulatedAnalysis(file);
  }

  async function simulatedAnalysis(file) {
    await delay(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 2400);
    const fields = {
      product: "Gel douche",
      target: "Sportifs",
      ambiance: ["Énergie", "Fraîcheur"],
      notes: ["Agrumes", "Menthe", "Notes vertes"],
      constraints: ["Naturel", "Vegan"],
      intensity: "Modérée",
      market: "Europe",
      volume: null,
      launch: null,
    };
    const has = (k) => (Array.isArray(fields[k]) ? fields[k].length > 0 : Boolean(fields[k]));
    return {
      fileName: file ? file.name : SIMULATED_EXAMPLE.name,
      summary: "Un gel douche pour une nouvelle gamme destinée aux sportifs, vendue en Europe. Vous recherchez une fragrance énergisante et fraîche, autour des agrumes et de la menthe, avec une formule naturelle et vegan.",
      projectName: "Gel douche Aqua Sport",
      fields,
      found: FIELD_KEYS.filter(has),
      missing: FIELD_KEYS.filter((k) => !has(k)),
    };
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
