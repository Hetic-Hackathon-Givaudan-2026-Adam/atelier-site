/* =========================================================
   Givaudan Atelier — configuration of the local RAG API
   (repository atelier-rag-api, see its README).
   Override for tests: localStorage.setItem("atelierApiUrl", "http://127.0.0.1:8002")
   ========================================================= */
window.AtelierConfig = (() => {
  "use strict";
  let apiUrl = "http://127.0.0.1:8001";
  try {
    const override = localStorage.getItem("atelierApiUrl");
    if (override) apiUrl = override.replace(/\/+$/, "");
  } catch (_) { /* storage blocked */ }
  return {
    apiUrl,
    chatTimeoutMs: 30000,
    importTimeoutMs: 60000, // reading a whole brief takes ~40 s on a CPU-only PC (API limit: 60 s)
    healthTimeoutMs: 2500,
  };
})();
