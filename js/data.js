/* RLS applies to every request. In-memory records only live for this page. */
window.AtelierData = (() => {
  let loading;
  let projects = [];
  let messages = [];
  let preferences = {};
  let writes = Promise.resolve();

  function value(result) {
    if (result.error) throw result.error;
    return result.data;
  }

  function project(row) {
    const state = row.state || {};
    const brief = (row.briefs || []).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const fallbackStatus = { draft: "draft", pending: "expert", in_progress: "proposed", completed: "done", cancelled: "cancelled" };
    return {
      ...state,
      id: row.id, name: row.name, created: row.created_at, date: row.updated_at,
      product: state.product || brief?.fields?.product,
      brief: state.brief || brief?.fields,
      source: state.source || (brief?.file_name ? { type: "import", fileName: brief.file_name } : null),
      blends: state.blends || (row.recommendations || []).map((item) => ({
        ...item.composition_data, id: item.composition_id, name: item.composition_name,
      })),
      status: state.status || fallbackStatus[row.status] || "draft",
      revision: row.revision, commercialId: row.commercial_id, clientName: row.client_label,
    };
  }

  async function load() {
    const session = await AtelierSession.ready;
    if (!session) return false;
    const [p, m, pref] = await Promise.all([
      supabaseClient.from("projects").select(
        "*, briefs(fields,file_name,created_at), recommendations(composition_data,composition_id,composition_name)",
      ).order("updated_at", { ascending: false }),
      supabaseClient.from("project_messages").select("*").order("created_at"),
      supabaseClient.from("atelier_preferences").select("data").eq("owner", session.id).maybeSingle(),
    ]);
    const nextProjects = value(p).map(project);
    const nextMessages = value(m);
    const nextPreferences = value(pref)?.data || {};
    projects = nextProjects;
    messages = nextMessages;
    preferences = nextPreferences;
    AtelierSession.renderMessagesBadge();
    return true;
  }

  function report(error) {
    console.error("Données Atelier", error.message);
    let status = document.querySelector("#atelier-data-status");
    if (!status) {
      status = document.createElement("p");
      status.id = "atelier-data-status";
      status.setAttribute("role", "alert");
      document.body.prepend(status);
    }
    status.textContent = "Impossible de synchroniser les données. Vérifiez la connexion et rechargez cette page.";
  }

  async function saveProject(snapshot) {
    const id = snapshot.id || crypto.randomUUID();
    const previous = projects.find((p) => p.id === id);
    const data = { ...snapshot };
    for (const key of ["id", "created", "date", "revision", "commercialId", "clientName"]) delete data[key];
    const row = await AtelierAPI.saveProject(id, previous?.revision ?? -1, data);
    const saved = project(row);
    projects = [saved, ...projects.filter((p) => p.id !== id)];
    return saved;
  }

  async function send(projectId, content) {
    const { id, role } = AtelierSession.get();
    const row = value(await supabaseClient.from("project_messages").insert({
      project_id: projectId, sender_id: id, sender_role: role, content,
    }).select().single());
    messages.push(row);
    return row;
  }

  async function markRead(projectId) {
    const { id } = AtelierSession.get();
    const pending = messages.filter((m) => !m.read_at && m.sender_id !== id && (!projectId || m.project_id === projectId));
    if (!pending.length) return;
    value(await supabaseClient.rpc("atelier_read_messages", { messages: pending.map((m) => m.id) }));
    pending.forEach((m) => { m.read_at = new Date().toISOString(); });
  }

  function savePreference(key, data) {
    if (key !== "usualConstraints") preferences = { ...preferences, [key]: data };
    const snapshot = structuredClone(data);
    writes = writes.catch(() => {}).then(async () => {
      value(await supabaseClient.rpc("atelier_save_preference", { pref: key, items: snapshot }));
      if (key === "usualConstraints") preferences = { ...preferences, [key]: snapshot };
    });
    writes.catch(report);
    return writes;
  }

  return {
    get ready() { return loading ||= load().catch((error) => { report(error); return false; }); },
    load, report, saveProject, send, markRead, value, savePreference,
    preference: (key, fallback = []) => structuredClone(preferences[key] ?? fallback),
    projects: () => projects,
    messages: () => messages,
  };
})();
