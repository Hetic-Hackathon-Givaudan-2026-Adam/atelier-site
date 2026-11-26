window.AtelierConfig = {
  apiUrl: (window.AtelierRuntime?.apiUrl || "http://127.0.0.1:8001").replace(/\/+$/, ""),
  chatTimeoutMs: 90000,
  importTimeoutMs: 90000,
  healthTimeoutMs: 4500,
};
