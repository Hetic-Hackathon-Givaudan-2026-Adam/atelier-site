/* =========================================================
   Givaudan Atelier — conversation engine ("L'Atelier")

   ONE entry point:  await getAssistantTurn(projectState, userInput)

   projectState  { step, firstName, existingClient, product, target, ambiance[],
                   notes[], constraints[], intensity, market, volume, launch,
                   potential, blend, status }
   userInput     null                                    → first message
                 { type: "chips",  values: ["Énergie"] }
                 { type: "groups", values: { market, volume, launch } }
                 { type: "text",   text: "Un gel douche…" }
                 { type: "action", action: "resume" | "sample" | "expert" | "edit_brief"
                   | "edit_topic" | "start_chat" | "import_validated", … }
                 (import_validated: { fields, projectName } read from an imported
                  brief, see js/brief-import.js — returns the reveal turn)

   returns       { message, chips, multiple, groups, placeholder,
                   projectUpdates, step, blends?, action?, confirmation?,
                   recap?, resume?, entry? }
                 (entry: first turn of a new project — the UI offers
                  "Discuter avec l'Atelier" or "Importer mon brief")

   projectState also carries projectId / projectName / blends / favorite
   when an existing project is resumed. "message" may contain *italic* words.

   When the local RAG API answers (js/api.js → POST /atelier/chat), its turn
   is returned as is (same shape; blends may also carry toConfirm,
   technicalName; a reveal with noMatch: true has no blends → expert path).
   Otherwise simulatedTurn() — the scripted engine below, reading
   js/scenario.js with simple keyword detection — answers.
   ========================================================= */
(() => {
  "use strict";

  const SC = window.AtelierScenario;
  const K = SC.keywords;

  /* ---------------- keyword helpers ---------------- */
  const first = (list, text) => {
    for (const [re, value] of list) if (re.test(text)) return value;
    return null;
  };
  const all = (list, text) => {
    const out = [];
    for (const [re, value] of list) if (re.test(text) && !out.includes(value)) out.push(value);
    return out;
  };

  function notesFor(ambiances, text = "") {
    const out = all(K.notes, text);
    ambiances.forEach((a) => (SC.ambianceNotes[a] || []).forEach((n) => { if (!out.includes(n)) out.push(n); }));
    return out.slice(0, SC.maxNotes);
  }

  function volumeFrom(text) {
    const t = text.replace(",", ".");
    let m = t.match(/(\d+(?:\.\d+)?)\s*(?:t\b|tonnes?)/i);
    let tons = m ? parseFloat(m[1]) : null;
    if (tons === null && (m = t.match(/(\d+(?:\.\d+)?)\s*kg/i))) tons = parseFloat(m[1]) / 1000;
    if (tons === null) return null;
    return tons < 1 ? "Moins d'1 t" : tons <= 10 ? "1 à 10 t" : "Plus de 10 t";
  }
  function launchFrom(text) {
    let m = text.match(/(\d+)\s*mois/i);
    let months = m ? parseInt(m[1], 10) : null;
    if (months === null && (m = text.match(/(\d+)\s*ans?\b/i))) months = parseInt(m[1], 10) * 12;
    if (months === null) return null;
    return months < 6 ? "Moins de 6 mois" : months <= 12 ? "6 à 12 mois" : "Plus de 12 mois";
  }

  function potentialOf(s) {
    const P = SC.potential;
    const score = (P.volume[s.volume] || 0) + (P.launch[s.launch] || 0) + (P.market[s.market] || 0);
    return score >= 3 ? "élevé" : score === 2 ? "moyen" : "faible";
  }

  /* "Gel douche" + "Énergie" → "Gel douche Énergie" */
  function projectName(s) {
    const product = s.product || SC.defaults.product;
    const main = (s.ambiance || []).find((a) => a !== "Je ne sais pas");
    return `${product === "Autre produit" ? "Projet" : product} ${main || "Signature"}`;
  }

  /* ---------------- one question ---------------- */
  function ask(step, s, extra = {}) {
    const def = SC.steps[step];
    return {
      message: def.message(s),
      chips: def.chips || null,
      multiple: Boolean(def.multiple),
      groups: def.groups || null,
      placeholder: def.placeholder || "Décrivez votre projet…",
      step,
      projectUpdates: {},
      ...extra,
    };
  }

  /* ---------------- read the answer to the current step ---------------- */
  function read(step, input, s) {
    const text = input.type === "text" ? input.text : "";
    const picked = input.type === "chips" ? input.values : [];
    const u = {};

    switch (step) {
      case "product":
        u.product = picked.length
          ? SC.productChips[picked[0]] || picked[0]
          : first(K.product, text) || SC.defaults.product;
        break;
      case "ambiance": {
        let amb = picked.length ? picked : all(K.ambiance, text);
        if (amb.length > 1) amb = amb.filter((a) => a !== "Je ne sais pas");
        if (!amb.length) amb = SC.defaults.ambiance.slice();
        u.ambiance = amb;
        u.notes = notesFor(amb, text);
        break;
      }
      case "constraints": {
        let c = picked.length ? picked : all(K.constraints, text);
        if (c.length > 1) c = c.filter((x) => x !== "Aucune");
        if (!c.length) c = text && K.noConstraint.test(text) ? ["Aucune"] : SC.defaults.constraints.slice();
        u.constraints = c;
        break;
      }
      case "intensity":
        u.intensity = picked[0] || first(K.intensity, text) || SC.defaults.intensity;
        break;
      case "business": {
        const g = input.type === "groups" ? input.values : {};
        u.market = g.market || first(K.market, text) || SC.defaults.market;
        u.volume = g.volume || volumeFrom(text) || SC.defaults.volume;
        u.launch = g.launch || launchFrom(text) || SC.defaults.launch;
        u.potential = potentialOf(u); // internal only — never shown to the customer
        break;
      }
      default:
        break;
    }

    // free text can also reveal the target or the requirements at any time
    if (text) {
      const target = first(K.target, text);
      if (target && !s.target) u.target = target;
      if (step !== "constraints" && !(s.constraints || []).length) {
        const c = all(K.constraints, text);
        if (c.length) u.constraints = c;
      }
    }
    return u;
  }

  /* blends currently offered: the project's own (resumed project) or the
     scenario's — never one the client rejected */
  const offered = (s) => present(withoutRejected(s.blends && s.blends.length ? s.blends : SC.blends, directionOf(s)));

  /* ================= the client's history =================
     Projects (Store.listProjects) and sample feedback (Orders.list) of the
     signed-in client. Later the RAG API knows them on the server side. */
  const clientProjects = () => (window.AtelierStore && window.AtelierStore.listProjects ? window.AtelierStore.listProjects() : []);
  // blends rated "il convient" → name of the project they were rated for
  function likedBlends() {
    const O = window.AtelierOrders;
    const liked = {};
    if (!O) return liked;
    O.list().forEach((o) => {
      if (o.feedback && o.feedback.verdict === "fits") {
        const name = o.reference.replace(/\s+—\s+version ajustée$/, "");
        if (!liked[name]) liked[name] = o.projectName || "un projet précédent";
      }
    });
    return liked;
  }
  // label the proposed blends the client already liked (never forced into the list)
  function present(list) {
    const liked = likedBlends();
    return list.map(({ liked: _old, ...b }) => (liked[b.name] ? { ...b, liked: liked[b.name] } : b));
  }
  // requirements shared by at least 2 of the client's projects
  function inferredConstraints() {
    const count = {};
    clientProjects().forEach((p) => ((p.brief && p.brief.constraints) || []).forEach((c) => {
      if (c !== "Aucune") count[c] = (count[c] || 0) + 1;
    }));
    return Object.keys(count).filter((c) => count[c] >= 2);
  }
  // the requirements edited by the client in Mon profil, or null when never edited
  function profileConstraints() {
    const P = window.AtelierStore && window.AtelierStore.profile ? window.AtelierStore.profile() : null;
    if (!P || !P.edited || !Array.isArray(P.usualConstraints)) return null;
    return P.usualConstraints.filter((c) => typeof c === "string" && c && c !== "Aucune");
  }
  // Mon profil wins over the history (an empty list = no pre-selection)
  function usualConstraints() {
    const own = profileConstraints();
    return own || inferredConstraints();
  }

  /* Blends the client said "ne convient pas" to (Mes commandes → sample
     feedback) are never proposed again: removed, and the list is completed
     back to 3 with the next blends of the same direction (fewer if none left).
     Later the RAG API knows the rejected blends on the server side. */
  const rejectedNames = () => (window.AtelierStore && window.AtelierStore.rejectedBlends ? window.AtelierStore.rejectedBlends() : []);
  function withoutRejected(list, direction) {
    const rejected = rejectedNames();
    if (!rejected.length) return list;
    const kept = list.filter((b) => !rejected.includes(b.name));
    if (kept.length === list.length) return list;
    const extra = (SC.blendSets[direction] || []).map((id) => CATALOG.get(id))
      .filter((b) => b && !rejected.includes(b.name) && !kept.some((k) => k.id === b.id));
    return kept.concat(extra).slice(0, 3)
      .map(({ match, ...b }, i) => (i === 0 ? { ...b, match: "Très proche de votre brief" } : b));
  }

  /* ================= "Modifier mon brief" =================
     step "edit"          → "Que souhaitez-vous modifier ?" (topic chips or free text)
     step "edit-<topic>"  → the question of that topic, current values pre-selected
     then only the changed fields are updated and the blends are refreshed. */
  const E = SC.edit;
  const CATALOG = new Map([...SC.blends, ...SC.blendCatalog].map((b) => [b.id, b]));

  // dominant ambiance → olfactory direction ("frais", "boise", …)
  function directionOf(s) {
    const main = (s.ambiance || []).find((a) => a !== "Je ne sais pas") || (s.ambiance || [])[0];
    return SC.blendDirections[main] || "frais";
  }
  function blendSet(direction) {
    const set = (SC.blendSets[direction] || SC.blendSets.frais).map((id, i) => {
      const { match, ...b } = CATALOG.get(id);
      return i === 0 ? { ...b, match: "Très proche de votre brief" } : b;
    });
    return present(withoutRejected(set, SC.blendSets[direction] ? direction : "frais"));
  }

  /* ================= "Partir d'un projet existant" =================
     choose-project → start_from_project → from-ambiance (same / new direction)
     → [from-newambiance] → from-intensity → reveal. Product, target,
     requirements and business answers are taken from the source project. */
  const PREFILLED = ["product", "target", "constraints", "market", "volume", "launch"];
  function projectChoices() {
    // the project's own blends first (blends of the RAG bank), then the scenario catalog
    const nameOf = (ref, p) => {
      if (!ref) return null;
      if (ref.name) return ref.name;
      const own = (p.blends || []).find((b) => b.id === ref);
      return own ? own.name : (CATALOG.get(ref) || {}).name || null;
    };
    return clientProjects().map((p) => {
      const chosen = nameOf(p.blend, p);
      const fav = nameOf(p.favorite, p);
      return { id: p.id, name: p.name, product: p.product, date: p.date, blend: chosen || fav || null, blendFlag: chosen ? "choisi" : fav ? "favori" : null };
    });
  }
  function chooseProject(message = "Avec plaisir. Quel projet souhaitez-vous reprendre ?") {
    return { message, step: "choose-project", projectUpdates: {}, projectChoices: projectChoices(), placeholder: "Ou écrivez le nom du projet…" };
  }
  function startFromProject(s, p) {
    const b = p.brief || {};
    const updates = {
      projectId: null, created: null, blends: [], favorite: null, blend: null, status: null, source: null,
      product: p.product || null, target: b.target || null, constraints: (b.constraints || []).slice(),
      market: b.market || null, volume: b.volume || null, launch: b.launch || null,
      ambiance: [], notes: [], intensity: null,
      projectName: `${p.product || "Projet"} — nouvelle version`,
      fromProject: { id: p.id, name: p.name, ambiance: (b.ambiance || []).slice(), notes: (b.notes || []).slice(), intensity: b.intensity || null },
    };
    updates.potential = potentialOf({ ...s, ...updates });
    const amb = updates.fromProject.ambiance;
    return {
      message: amb.length
        ? `Gardons-nous la même ambiance (${amb.join(", ")}), ou souhaitez-vous une nouvelle direction ?`
        : "Souhaitez-vous garder la même direction, ou en explorer une nouvelle ?",
      chips: ["Même ambiance", "Nouvelle direction"],
      multiple: false,
      step: "from-ambiance",
      projectUpdates: updates,
      prefilled: PREFILLED.filter((k) => (Array.isArray(updates[k]) ? updates[k].length : updates[k])),
      prefilledFrom: p.name,
      placeholder: "Ex. : la même ambiance, en un peu plus intense.",
    };
  }
  function askIntensityFrom(s, updates = {}) {
    const next = { ...s, ...updates };
    const t = ask("intensity", next, { projectUpdates: updates });
    const prev = s.fromProject && s.fromProject.intensity;
    if (prev) t.selected = [prev];
    t.step = "from-intensity";
    return t;
  }

  function editMenu(s, message = E.ask) {
    return {
      message,
      chips: E.topics.map(([label]) => label),
      multiple: false,
      step: "edit",
      projectUpdates: {},
      placeholder: E.placeholder,
    };
  }

  // the main-scenario question of one topic, with the current answers pre-selected
  function askTopic(topic, s, intro = "") {
    const t = ask(topic, s);
    t.step = `edit-${topic}`;
    if (intro) t.message = `${intro} ${t.message}`;
    if (topic === "ambiance") {
      const current = (s.ambiance || []).filter((a) => !t.chips.includes(a));
      // values found in free text earlier (e.g. "Boisé") become chips too
      t.chips = [...t.chips.slice(0, -1), ...current, t.chips[t.chips.length - 1]];
      t.selected = (s.ambiance || []).slice();
      t.placeholder = E.placeholder;
    }
    if (topic === "constraints") t.selected = (s.constraints || []).slice();
    if (topic === "intensity") t.selected = s.intensity ? [s.intensity] : [];
    if (topic === "business") t.selectedGroups = { market: s.market, volume: s.volume, launch: s.launch };
    return t;
  }

  // "Tout reprendre": back to the ambiance question, keeping product and target
  function restartBrief(s) {
    const cleared = {
      ambiance: [], notes: [], constraints: [], intensity: null, market: null, volume: null,
      launch: null, potential: null, blend: null, status: null,
    };
    const t = ask("ambiance", { ...s, ...cleared });
    t.message = `${E.restartAll} ${t.message}`;
    t.projectUpdates = cleared;
    return t;
  }

  // keyword detection in a free-text modification: values found + topics named
  function detectEdit(text, onlyTopic = null) {
    const t = text.replace(/intensit[ée]s?/gi, " "); // "intensité modérée" ≠ "intense"
    const u = {};
    const want = (topic) => !onlyTopic || onlyTopic === topic;
    if (want("ambiance")) {
      const amb = all(K.ambiance, t);
      if (amb.length) { u.ambiance = amb; u.notes = notesFor(amb, t); }
    }
    if (want("constraints")) {
      const c = all(K.constraints, t);
      if (c.length) u.constraints = c;
      else if (onlyTopic && K.noConstraint.test(t)) u.constraints = ["Aucune"];
    }
    if (want("intensity")) {
      const i = first(K.intensity, t);
      if (i) u.intensity = i;
    }
    if (want("business")) {
      const m = first(K.market, t);
      const v = volumeFrom(t);
      const l = launchFrom(t);
      if (m) u.market = m;
      if (v) u.volume = v;
      if (l) u.launch = l;
    }
    const topics = E.topicWords.filter(([re]) => re.test(text)).map(([, topic]) => topic);
    return { updates: u, topics };
  }

  // apply the changed fields, keep or refresh the blends, show them again
  function applyEdit(s, updates) {
    const next = { ...s, ...updates };
    const u = { ...updates };
    if ("market" in u || "volume" in u || "launch" in u) u.potential = potentialOf(next); // internal
    const changed = Object.keys(u).filter((k) => k !== "potential" && JSON.stringify(u[k]) !== JSON.stringify(s[k]));
    // same olfactory direction (e.g. only intensity / business changed) → same blends
    const blends = directionOf(next) === directionOf(s) ? offered(s) : blendSet(directionOf(next));
    u.blends = blends;
    return {
      message: E.updated,
      step: "reveal",
      projectUpdates: u,
      changed,
      blends,
      placeholder: SC.steps.reveal.placeholder,
    };
  }

  function chipsToTopic(label) {
    const found = E.topics.find(([l]) => l === label);
    return found ? found[1] : null;
  }

  // answer given at the "Que souhaitez-vous modifier ?" step (or typed after the reveal)
  function readEditAnswer(s, input, fallbackToMenu) {
    if (input.type === "chips") {
      const topic = chipsToTopic(input.values[0]);
      if (topic === "all") return restartBrief(s);
      if (topic) return askTopic(topic, s);
    }
    const text = input.text || "";
    if (E.restartWords.test(text)) return restartBrief(s);
    const { updates, topics } = detectEdit(text);
    if (Object.keys(updates).length) return applyEdit(s, updates);
    if (topics.length) return askTopic(topics[0], s);
    return fallbackToMenu ? editMenu(s, E.notUnderstood) : null;
  }

  /* ---------------- actions (buttons outside the chips) ---------------- */
  function act(s, input) {
    const blend = offered(s).find((b) => b.id === input.blendId) || null;
    const name = s.projectName || projectName(s); // a resumed project keeps its name

    if (input.action === "choose_project") return chooseProject();
    if (input.action === "start_from_project") {
      const p = clientProjects().find((x) => x.id === input.projectId);
      return p ? startFromProject(s, p) : chooseProject("Je ne retrouve pas ce projet. Lequel souhaitez-vous reprendre ?");
    }
    if (input.action === "start_chat") {
      // "Revenir à la discussion" from the brief import
      const t = ask("product", s);
      t.message = "Très bien, discutons. Quel produit souhaitez-vous parfumer ?";
      return t;
    }
    if (input.action === "import_validated") {
      // the customer confirmed the brief read from their document → blends
      const fields = input.fields || {};
      const next = { ...s, ...fields };
      const blends = blendSet(directionOf(next));
      return {
        message: SC.steps.reveal.message(next),
        step: "reveal",
        projectUpdates: {
          ...fields,
          projectName: input.projectName || s.projectName || projectName(next),
          potential: potentialOf(next), // internal, for the sales team
          blends,
        },
        blends,
        placeholder: SC.steps.reveal.placeholder,
      };
    }
    if (input.action === "resume") {
      // compact recap + the blends proposed earlier, instead of replaying the questions
      return {
        message: `Bon retour, ${s.firstName}. Voici où nous en étions pour votre projet *${name}*.`,
        step: "reveal",
        projectUpdates: {},
        recap: true,
        resume: true,
        blends: offered(s),
        placeholder: SC.steps.reveal.placeholder,
      };
    }
    if (input.action === "expert") {
      return {
        message: SC.messages.expert(s),
        step: "done",
        projectUpdates: { status: "expert", blend: blend ? blend.id : null, projectName: name },
      };
    }
    if (input.action === "sample") {
      const number = input.orderNumber || `GA-2026-${String(SC.orderBase + (input.sequence || 0)).padStart(4, "0")}`;
      return {
        message: SC.messages.sampleConfirmed,
        step: "done",
        projectUpdates: {
          status: "requested",
          blend: blend ? blend.id : offered(s)[0].id,
          format: input.format || "Échantillon 50 ml",
          projectName: (input.name || "").trim() || name,
          address: input.address || SC.defaultAddress,
          orderNumber: number,
        },
        confirmation: { number, delivery: "Livraison estimée sous 5 jours ouvrés" },
      };
    }
    if (input.action === "edit_brief") return editMenu(s); // "Que souhaitez-vous modifier ?"
    if (input.action === "edit_topic" && E.intro[input.topic]) {
      // pencil icon of the project card: straight to that topic
      return askTopic(input.topic, s, E.intro[input.topic]);
    }
    return { message: SC.messages.revealHelp, step: s.step, projectUpdates: {} };
  }

  /* ---------------- the scripted engine (simulation) ---------------- */
  async function simulatedTurn(projectState, userInput) {
    const s = projectState || {};

    // first turn of a new project: the UI offers "Discuter" or "Importer mon brief"
    // — and, for a returning client, "Partir d'un projet existant"
    if (!userInput) {
      const t = { ...ask("product", s), entry: true };
      const history = s.existingClient ? clientProjects() : [];
      if (history.length) {
        const names = history.slice(0, 2).map((p) => `*${p.name}*`);
        const list = history.length > 2 ? `${names.join(", ")} et d'autres projets` : names.join(" et ");
        t.message = `Bonjour ${s.firstName}. Je vois que vous avez déjà travaillé avec nous sur ${list}.`;
        t.entryOptions = ["project", "chat", "import"];
      }
      return t;
    }
    if (userInput.type === "action") return act(s, userInput);

    // after the reveal: free text can ask for a sample or an expert
    if (s.step === "reveal") {
      const text = userInput.text || "";
      if (/expert|conseill|parfumeur|humain|parler|appel/i.test(text)) return act(s, { action: "expert" });
      const named = offered(s).find((b) => text.toLowerCase().includes(b.name.toLowerCase()));
      if (named || /[ée]chantillon|command|tester|essayer|recevoir/i.test(text)) {
        const blend = named || offered(s)[0];
        return {
          message: `Très bien. Voici le récapitulatif pour ${blend.name}.`,
          step: "reveal",
          projectUpdates: {},
          action: { type: "sample", blendId: blend.id },
        };
      }
      // "plus boisé", "finalement subtile"… typed after the reveal = a brief modification
      const edit = readEditAnswer(s, userInput, false);
      if (edit) return edit;
      return { message: SC.messages.revealHelp, step: "reveal", projectUpdates: {} };
    }
    if (s.step === "done") return { message: SC.messages.done, step: "done", projectUpdates: {} };

    /* "Partir d'un projet existant" steps */
    if (s.step === "choose-project") {
      const text = (userInput.text || "").toLowerCase();
      const p = clientProjects().find((x) => text && (text.includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(text)));
      return p ? startFromProject(s, p) : chooseProject("Je n'ai pas trouvé ce projet. Lequel souhaitez-vous reprendre ?");
    }
    if (s.step === "from-ambiance") {
      const pick = userInput.type === "chips" ? userInput.values[0] : "";
      const text = userInput.text || "";
      const from = s.fromProject || { ambiance: [], notes: [] };
      if (pick === "Même ambiance" || /m[êe]me|garde|pareil|identique/i.test(text)) {
        return askIntensityFrom(s, { ambiance: from.ambiance.slice(), notes: from.notes.slice() });
      }
      if (text) {
        // an ambiance named in free text = the new direction
        const updates = read("ambiance", userInput, s);
        if (all(K.ambiance, text).length) return askIntensityFrom(s, updates);
      }
      const t = ask("ambiance", s);
      t.step = "from-newambiance";
      return t;
    }
    if (s.step === "from-newambiance") return askIntensityFrom(s, read("ambiance", userInput, s));
    if (s.step === "from-intensity") {
      const updates = read("intensity", userInput, s);
      delete updates.target;
      const next = { ...s, ...updates };
      const blends = blendSet(directionOf(next));
      return {
        ...ask("reveal", next),
        projectUpdates: { ...updates, blends, potential: potentialOf(next) },
        blends,
      };
    }

    if (s.step === "edit") return readEditAnswer(s, userInput, true);
    if (typeof s.step === "string" && s.step.startsWith("edit-")) {
      // answer to the re-asked question: only this topic changes
      const topic = s.step.slice(5);
      let updates;
      if (userInput.type === "text") updates = detectEdit(userInput.text, topic).updates;
      else {
        updates = read(topic, userInput, s);
        delete updates.target; // chips never change the target
      }
      return applyEdit(s, updates);
    }

    const updates = read(s.step, userInput, s);
    const next = { ...s, ...updates };
    const nextStep = SC.order[SC.order.indexOf(s.step) + 1] || "reveal";
    const turn = ask(nextStep, next, { projectUpdates: updates });
    if (nextStep === "constraints") preselectUsual(turn, s);
    if (nextStep === "reveal") {
      // a resumed project whose brief was edited gets its own proposed blends again;
      // a new project gets the blends of its olfactory direction
      turn.blends = next.blends && next.blends.length ? offered(next) : blendSet(directionOf(next));
      turn.projectUpdates.blends = turn.blends;
    }
    return turn;
  }

  /* usual requirements pre-selected on the "constraints" question (can be
     unselected): those of Mon profil when edited (any client), otherwise those
     inferred from a returning client's history */
  function preselectUsual(turn, s) {
    const own = profileConstraints();
    const usual = own || (s.existingClient ? inferredConstraints() : []);
    const chips = Array.isArray(turn.chips) ? turn.chips : [];
    const picked = usual.filter((c) => !chips.length || chips.includes(c));
    if (!picked.length) {
      if (own) { delete turn.selected; delete turn.hint; } // the client removed them all
      return turn;
    }
    turn.selected = picked;
    turn.hint = own ? "Pré-sélectionné d'après vos habitudes (Mon profil)." : "Pré-sélectionné comme pour vos projets précédents.";
    return turn;
  }

  /* ---------------- the single entry point ----------------
     Local RAG API when it answers (js/api.js), otherwise the scripted engine.
     A failed call falls back to the simulation for THIS message only. */
  async function getAssistantTurn(projectState, userInput) {
    const API = window.AtelierAPI;
    if (API && (await API.ready())) {
      try {
        const turn = await API.chat(projectState, userInput);
        // the API context has no field for the habits of Mon profil: they are
        // applied to the suggestion chips of its "constraints" question
        if (turn && turn.step === "constraints" && profileConstraints()) preselectUsual(turn, projectState || {});
        return turn;
      } catch (err) {
        console.info("[Atelier] IA locale sans réponse pour ce message : simulation.");
        API.markDown();
      }
    }
    return simulatedTurn(projectState, userInput);
  }

  /* answer lists of one brief field, for the review card of an imported brief
     (same lists as the conversation) → { chips, multiple } or null for text */
  function fieldChoices(key) {
    const groups = SC.steps.business.groups;
    const group = groups.find((g) => g.key === key);
    if (group) return { chips: group.chips.slice(), multiple: false };
    if (key === "ambiance") {
      // the conversation's chips first, then the other known ambiances (Boisé, Floral…)
      const base = SC.steps.ambiance.chips.filter((a) => a !== "Je ne sais pas");
      const more = Object.keys(SC.ambianceNotes).filter((a) => a !== "Je ne sais pas" && !base.includes(a));
      return { chips: base.concat(more), multiple: true };
    }
    if (key === "constraints") return { chips: SC.steps.constraints.chips.slice(), multiple: true };
    if (key === "intensity") return { chips: SC.steps.intensity.chips.slice(), multiple: false };
    return null;
  }

  window.AtelierAssistant = {
    getAssistantTurn, simulatedTurn, projectName, blends: SC.blends,
    // helpers for the brief import review (later: returned by the RAG API)
    fieldChoices, notesFor: (ambiance) => notesFor(ambiance || []), potentialOf,
    // Mon profil → "Mes habitudes"
    inferredConstraints, usualConstraints, constraintChips: () => SC.steps.constraints.chips.filter((c) => c !== "Aucune"),
  };
})();
