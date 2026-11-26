/* Project conversations shared by the client and the assigned commercial. */
window.AtelierMessages = (() => {
  function list() {
    return (window.AtelierData?.messages() || [])
      .filter((m) => ["client", "commercial"].includes(m.sender_role))
      .map((m) => ({
        id: m.id, from: m.sender_role === "commercial" ? "sales" : "client",
        text: m.content, date: m.created_at, seen: Boolean(m.read_at),
        read: Boolean(m.read_at) || m.sender_id === AtelierSession.get()?.id,
        about: { type: "project", id: m.project_id, label: AtelierStore.find(m.project_id)?.name || "Projet" },
      }));
  }
  const about = (id) => list().filter((m) => m.about.id === id);
  return {
    TODAY: AtelierClock.DEMO_DATE,
    list, about,
    unreadCount: () => list().filter((m) => !m.read).length,
    add: ({ text, about }) => AtelierData.send(about.id, text),
    addSales: (text, about) => AtelierData.send(about.id, text),
    markAllRead: () => AtelierData.markRead(),
    waitingForSales(id) {
      const messages = about(id);
      const last = messages.filter((m) => m.from === "sales").at(-1)?.date || "";
      return messages.filter((m) => m.from === "client" && m.date > last);
    },
  };
})();
