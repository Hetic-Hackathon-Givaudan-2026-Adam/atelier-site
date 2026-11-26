/* Shared project views and persisted client preferences. */
window.AtelierStore = (() => {
  "use strict";
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
    AtelierData.projects().forEach((p) => byId.set(p.id, p));
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
    findBlend, splitBlendTags,
    projects: () => AtelierData.projects(),
    listProjects: () => AtelierData.projects(),
    find: (id) => AtelierData.projects().find((p) => p.id === id) || null,
    saveProject: (project) => AtelierData.saveProject(project),
    orders: () => AtelierData.preference("orders"),
    rejectedBlends: () => AtelierData.preference("rejected"),
    rejectBlend(name) {
      const names = AtelierData.preference("rejected");
      if (name && !names.includes(name)) return AtelierData.savePreference("rejected", [...names, name]);
    },
  };
})();
