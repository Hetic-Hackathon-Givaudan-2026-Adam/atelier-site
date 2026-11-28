window.AtelierAPI = (() => {
  const config = window.AtelierConfig;
  const api = { status: "unknown" };

  async function request(path, options, timeout) {
    const response = await fetch(config.apiUrl + path, {
      ...options, signal: AbortSignal.timeout(timeout),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(typeof body.detail === "string" ? body.detail : `Erreur du service Atelier (${response.status}).`);
    }
    return body;
  }

  async function token() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data.session) throw new Error("Reconnectez-vous pour continuer.");
    return { Authorization: `Bearer ${data.session.access_token}` };
  }

  api.chat = async (projectState, userInput) => request("/atelier/chat", {
    method: "POST",
    headers: { ...await token(), "Content-Type": "application/json" },
    body: JSON.stringify({
      projectState, userInput,
      context: { rejectedBlends: AtelierStore.rejectedBlends() },
    }),
  }, config.chatTimeoutMs);

  api.saveProject = async (id, revision, snapshot) => request("/atelier/projects/save", {
    method: "POST",
    headers: { ...await token(), "Content-Type": "application/json" },
    body: JSON.stringify({ project: id, expected_revision: revision, snapshot }),
  }, 15000);

  api.deleteAccount = async (password) => request("/atelier/account/delete", {
    method: "POST",
    headers: { ...await token(), "Content-Type": "application/json" },
    body: JSON.stringify({ password, confirm: true }),
  }, 20000);

  api.importBrief = async (file) => {
    const body = new FormData();
    body.append("file", file, file.name);
    return request("/atelier/brief/import", { method: "POST", headers: await token(), body }, config.importTimeoutMs);
  };

  const labels = {
    unknown: "Vérification…", connected: "IA locale connectée", unavailable: "IA locale indisponible",
    incomplete: "Catalogue ou index indisponible",
  };

  api.recheck = async () => {
    api.status = "unknown";
    paint();
    try {
      const health = await request("/health", {}, config.healthTimeoutMs);
      api.status = !health.ollama.chat_model_installed ? "unavailable"
        : health.catalog_available && health.ollama.embed_model_installed && health.search !== "lexical"
          ? "connected" : "incomplete";
    } catch {
      api.status = "unavailable";
    }
    paint();
    return api.status === "connected";
  };

  function paint() {
    document.querySelectorAll("[data-api-pill]").forEach((pill) => {
      pill.dataset.status = api.status;
      let label = pill.querySelector(".api-pill-label");
      if (!label) {
        const dot = document.createElement("span");
        dot.className = "api-pill-dot";
        dot.setAttribute("aria-hidden", "true");
        label = document.createElement("span");
        label.className = "api-pill-label";
        label.setAttribute("aria-live", "polite");
        pill.replaceChildren(dot, label);
      }
      label.textContent = labels[api.status];
      pill.title = "Cliquer pour vérifier à nouveau.";
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const pills = document.querySelectorAll("[data-api-pill]");
    pills.forEach((pill) => pill.addEventListener("click", api.recheck));
    if (pills.length) api.recheck();
  });
  return api;
})();
