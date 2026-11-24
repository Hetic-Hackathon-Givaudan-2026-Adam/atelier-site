/* =========================================================
   Givaudan Atelier — client of the local RAG API

   AtelierAPI.ready()          → true when the API (and Ollama) answer, else false
   AtelierAPI.status           "unknown" | "connected" | "simulation"
   AtelierAPI.chat(state, in)  → turn of POST /atelier/chat (same shape as getAssistantTurn)
   AtelierAPI.importBrief(f)   → result of POST /atelier/brief/import, or { error } (413/415/422)
   AtelierAPI.recheck()        → forgets the cached status and checks again

   Any failure (network, timeout, content security policy of the published
   page, Ollama down) means "simulation": the site keeps its scripted engine.
   Nothing is thrown at page level and at most one console.info line is written.
   ========================================================= */
window.AtelierAPI = (() => {
  "use strict";

  const CFG = window.AtelierConfig || { apiUrl: "http://127.0.0.1:8001", chatTimeoutMs: 30000, importTimeoutMs: 60000, healthTimeoutMs: 2500 };
  const CACHE_KEY = "atelierApiStatus";
  const listeners = [];
  let pending = null;
  let noted = false;

  const api = { status: "unknown" };

  function setStatus(s) {
    api.status = s;
    try { sessionStorage.setItem(CACHE_KEY, s); } catch (_) { /* storage blocked */ }
    listeners.forEach((fn) => { try { fn(s); } catch (_) { /* listener error */ } });
  }
  function note(text) {
    if (noted) return;
    noted = true;
    console.info(`[Atelier] ${text}`);
  }

  // fetch with a timeout; rejects on network error, CSP block or timeout
  async function request(path, options, timeoutMs) {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      return await fetch(CFG.apiUrl + path, { ...options, signal: ctrl ? ctrl.signal : undefined });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function check() {
    try {
      const res = await request("/health", { method: "GET" }, CFG.healthTimeoutMs);
      if (!res.ok) throw new Error(`health ${res.status}`);
      const h = await res.json();
      const ok = Boolean(h && h.status === "ok" && h.ollama && h.ollama.available);
      setStatus(ok ? "connected" : "simulation");
      if (!ok) note("IA locale indisponible (Ollama arrêté) : mode simulation.");
      return ok;
    } catch (_) {
      setStatus("simulation");
      note("IA locale non joignable : mode simulation.");
      return false;
    }
  }

  // once per session (sessionStorage), once per page at most
  api.ready = function ready() {
    if (api.status === "connected") return Promise.resolve(true);
    if (api.status === "simulation") return Promise.resolve(false);
    let cached = null;
    try { cached = sessionStorage.getItem(CACHE_KEY); } catch (_) { /* storage blocked */ }
    if (cached === "connected" || cached === "simulation") {
      api.status = cached;
      return Promise.resolve(cached === "connected");
    }
    if (!pending) pending = check().finally(() => { pending = null; });
    return pending;
  };

  api.recheck = function recheck() {
    try { sessionStorage.removeItem(CACHE_KEY); } catch (_) { /* storage blocked */ }
    api.status = "unknown";
    noted = false;
    return api.ready();
  };

  // the API stopped answering during the session: next pages start in simulation
  api.markDown = function markDown() { setStatus("simulation"); };

  api.onStatus = function onStatus(fn) { listeners.push(fn); };

  /* ---------------- client history sent to the API ---------------- */
  api.buildContext = function buildContext() {
    const Store = window.AtelierStore;
    const Orders = window.AtelierOrders;
    const likedBlends = {};
    if (Orders) {
      Orders.list().forEach((o) => {
        if (o.feedback && o.feedback.verdict === "fits") {
          const name = String(o.reference || "").replace(/\s+—\s+version ajustée$/, "");
          if (name && !likedBlends[name]) likedBlends[name] = o.projectName || "un projet précédent";
        }
      });
    }
    const projects = Store && Store.listProjects ? Store.listProjects().map((p) => ({
      id: String(p.id), name: p.name || "Projet", product: p.product || null, date: p.date || null,
      status: p.status || null, brief: p.brief || {}, blend: p.blend || null, favorite: p.favorite || null,
      blends: Array.isArray(p.blends) ? p.blends : [], potential: p.potential || null,
    })) : [];
    return { rejectedBlends: Store && Store.rejectedBlends ? Store.rejectedBlends() : [], likedBlends, projects };
  };

  /* ---------------- conversation ---------------- */
  api.chat = async function chat(projectState, userInput) {
    const res = await request("/atelier/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectState, userInput, context: api.buildContext() }),
    }, CFG.chatTimeoutMs);
    if (!res.ok) throw new Error(`chat ${res.status}`);
    return res.json();
  };

  /* ---------------- brief import ---------------- */
  api.importBrief = async function importBrief(file) {
    const body = new FormData();
    body.append("file", file, file.name);
    const res = await request("/atelier/brief/import", { method: "POST", body }, CFG.importTimeoutMs);
    if ([413, 415, 422].includes(res.status)) {
      const err = await res.json().catch(() => ({}));
      return { error: typeof err.detail === "string" ? err.detail : "Nous n'avons pas pu lire ce document." };
    }
    if (!res.ok) throw new Error(`brief import ${res.status}`);
    return res.json();
  };

  /* ---------------- status pill: "IA locale connectée" / "Mode simulation" ----------------
     <button class="api-pill" data-api-pill> (Mes projets demo bar, Créer un projet panel).
     A click checks again (the cached status is cleared). */
  const LABELS = { unknown: "Vérification…", connected: "IA locale connectée", simulation: "Mode simulation" };
  function paint(btn) {
    const s = api.status;
    btn.dataset.status = s;
    btn.querySelector(".api-pill-label").textContent = LABELS[s] || LABELS.unknown;
    btn.setAttribute("aria-label", `${LABELS[s] || LABELS.unknown} — vérifier à nouveau`);
    btn.title = s === "connected"
      ? "Les réponses viennent de l'IA locale (Ollama). Cliquer pour vérifier à nouveau."
      : "Les réponses sont simulées. Cliquer pour vérifier à nouveau la connexion à l'IA locale.";
  }
  api.mountPills = function mountPills() {
    const pills = Array.from(document.querySelectorAll("[data-api-pill]"));
    if (!pills.length) return;
    pills.forEach((btn) => {
      btn.textContent = "";
      const dot = document.createElement("span");
      dot.className = "api-pill-dot";
      dot.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "api-pill-label";
      label.setAttribute("aria-live", "polite");
      btn.append(dot, label);
      paint(btn);
      btn.addEventListener("click", () => {
        api.status = "unknown";
        pills.forEach(paint);
        api.recheck();
      });
    });
    api.onStatus(() => pills.forEach(paint));
    api.ready().then(() => pills.forEach(paint));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", api.mountPills);
  else api.mountPills();

  return api;
})();
