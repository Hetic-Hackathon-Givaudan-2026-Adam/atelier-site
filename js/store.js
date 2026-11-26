/* =========================================================
   Givaudan Atelier — projects and orders created in the prototype
   localStorage only (shared by creer-projet and mes-projets).
   ========================================================= */
window.AtelierStore = (() => {
  "use strict";

  const PROJECTS = "givaudanAtelier.projects";
  const ORDERS = "givaudanAtelier.orders";
  // reserved for a saved "Créer un projet" conversation (not persisted today:
  // the conversation restarts on each visit) — cleared by reset() anyway
  const CONVERSATION = "givaudanAtelier.conversation";
  // blends the client said "ne convient pas" to — never proposed again
  const REJECTED = "givaudanAtelier.rejectedBlends";
  // Mon profil → "Mes habitudes": { usualConstraints: [...], edited: true }
  const PROFILE = "givaudanAtelier.profile";

  const load = (key) => {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return Array.isArray(v) ? v : [];
    } catch (_) {
      return [];
    }
  };
  const save = (key, list) => {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch (_) { /* storage blocked */ }
  };

  const lower = (s) => String(s || "").toLowerCase();
  const matches = (b, ref) => b && (b.id === ref || lower(b.name) === lower(ref) || (b.technicalName && lower(b.technicalName) === lower(ref)));

  /* A blend by id or name: the project's own blends first (blends of the RAG
     bank are stored there), then every project's blends, then the scenario
     catalog (js/scenario.js, when the page loads it). */
  function findBlend(ref, project) {
    if (!ref) return null;
    if (typeof ref === "object") ref = ref.id || ref.name;
    const own = project && Array.isArray(project.blends) ? project.blends.find((b) => matches(b, ref)) : null;
    if (own) return own;
    const byId = new Map();
    (window.AtelierSamples || []).forEach((p) => byId.set(p.id, p));
    load(PROJECTS).forEach((p) => byId.set(p.id, p));
    for (const p of byId.values()) {
      const b = (p.blends || []).find((x) => matches(x, ref));
      if (b) return b;
    }
    const SC = window.AtelierScenario;
    if (SC) return [...SC.blends, ...SC.blendCatalog].find((b) => matches(b, ref)) || null;
    return null;
  }

  /* Tags line without the "… à confirmer par nos experts" parts, and the
     requirements still to confirm (blend.toConfirm, from the RAG API). */
  function splitBlendTags(b) {
    const toConfirm = Array.isArray(b && b.toConfirm) ? b.toConfirm.slice() : [];
    const tags = String((b && b.tags) || "").split("·").map((t) => t.trim())
      .filter((t) => t && !/à confirmer par nos experts$/i.test(t)).join(" · ");
    return { tags, toConfirm };
  }

  return {
    findBlend,
    splitBlendTags,
    projects: () => load(PROJECTS),
    rejectedBlends: () => load(REJECTED),
    rejectBlend(name) {
      const list = load(REJECTED);
      if (name && !list.includes(name)) { list.push(name); save(REJECTED, list); }
    },
    orders: () => load(ORDERS),
    /* the client's own preferences (Mon profil), or null when never edited */
    profile() {
      try {
        const v = JSON.parse(localStorage.getItem(PROFILE));
        return v && typeof v === "object" && !Array.isArray(v) ? v : null;
      } catch (_) {
        return null;
      }
    },
    saveProfile(patch) {
      const next = { ...(this.profile() || {}), ...patch };
      try { localStorage.setItem(PROFILE, JSON.stringify(next)); } catch (_) { /* storage blocked */ }
      return next;
    },
    /* every project to display: samples + saved, merged BY ID (the saved
       version wins), newest first — each project appears only once */
    listProjects() {
      const byId = new Map();
      (window.AtelierSamples || []).forEach((p) => byId.set(p.id, { ...p, sample: true }));
      load(PROJECTS).forEach((p) => byId.set(p.id, { ...p, sample: false }));
      return [...byId.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
    },
    /* a saved project, or one of the sample projects (js/samples.js) */
    find(id) {
      if (!id) return null;
      return load(PROJECTS).find((p) => p.id === id)
        || (window.AtelierSamples || []).find((p) => p.id === id)
        || null;
    },
    /* create, or update the project with the same id (never duplicates).
       The updated project moves to the top with today's date. */
    saveProject(project) {
      // business date: the demo day (js/clock.js), with the real time of day
      const now = window.AtelierClock ? window.AtelierClock.nowISO() : new Date().toISOString();
      const list = load(PROJECTS);
      const i = project.id ? list.findIndex((p) => p.id === project.id) : -1;
      const previous = i > -1 ? list.splice(i, 1)[0] : {};
      const saved = {
        ...previous,
        ...project,
        id: project.id || `p-${Date.now()}`,
        created: project.created || previous.created || now,
        date: now,
      };
      list.unshift(saved); // newest first
      save(PROJECTS, list);
      return saved;
    },
    addProject(project) {
      return this.saveProject(project);
    },
    /* "Réinitialiser la démo": forget everything created during the tests.
       The session (givaudanAtelier.session) is left untouched. */
    reset() {
      try {
        // also the actions of the Espace commercial (Givaudan side of the demo)
        [PROJECTS, ORDERS, CONVERSATION, REJECTED, PROFILE, "givaudanAtelier.salesActions", "givaudanAtelier.messages", "givaudanAtelier.salesInbox"].forEach((k) => localStorage.removeItem(k));
        sessionStorage.removeItem(CONVERSATION);
      } catch (_) { /* storage blocked */ }
    },
  };
})();
