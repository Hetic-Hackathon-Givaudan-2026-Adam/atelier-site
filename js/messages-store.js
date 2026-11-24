/* =========================================================
   Givaudan Atelier — Messages (client ⇄ dedicated sales rep)
   Shared by the client pages (header badge, /messages, system events)
   and the Espace commercial (Claire reads and answers).

   localStorage "givaudanAtelier.messages" = { added: [...], readSeeds: [...],
   lastAutoReply } — the seed conversation is computed for the current mode
   (existing client: Claire Martin · new client: the team), so switching the
   demo mode never mixes both. Store.reset() clears the key → seed back.

   Message: { id, from: "client" | "sales" | "system", text, date (ISO),
              about: { type: "project" | "order", id, label } | null,
              actions: [{ label, kind, orderId }] | null, read, key?, auto? }
   Standalone: loaded in <head> before session.js (no dependency).
   ========================================================= */
window.AtelierMessages = (() => {
  "use strict";

  const KEY = "givaudanAtelier.messages";
  const Clock = window.AtelierClock;
  const TODAY = Clock.DEMO_DATE; // the demo date (js/clock.js)

  const session = () => {
    try { return JSON.parse(localStorage.getItem("givaudanAtelier.session")) || {}; } catch (_) { return {}; }
  };
  const existing = () => session().existingClient !== false;
  const load = () => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      return v && typeof v === "object" && Array.isArray(v.added) ? v : { added: [], readSeeds: [], lastAutoReply: 0 };
    } catch (_) {
      return { added: [], readSeeds: [], lastAutoReply: 0 };
    }
  };
  const save = (data) => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { /* storage blocked */ }
  };
  // "now" on the demo date (real clock time), so new messages are "Aujourd'hui"
  const now = () => Clock.nowISO();

  /* ---------------- seed conversation ---------------- */
  function seeds() {
    if (!existing()) {
      return [{
        id: "seed-team-welcome", from: "sales", date: "2026-11-22T09:00:00", about: null, actions: null, read: false,
        text: "Bienvenue ! Notre équipe vous répond ici sous 24 h, du lundi au vendredi.",
      }];
    }
    const first = session().firstName || "Mira";
    return [
      {
        id: "seed-claire-hello", from: "sales", date: "2026-11-03T09:30:00", about: null, actions: null, read: true,
        text: `Bonjour ${first}, je suis Claire Martin, votre interlocutrice dédiée chez Givaudan. N'hésitez pas à m'écrire ici pour toute question sur vos projets.`,
      },
      {
        id: "seed-ambre-delivered", from: "system", date: "2026-11-10T14:05:00", read: true, actions: null,
        about: { type: "order", id: "sample-order-ambre", label: "Ambre Doré — N° GA-2026-0119" },
        text: "Échantillon Ambre Doré livré.",
      },
      {
        id: "seed-claire-ambre", from: "sales", date: "2026-11-17T10:12:00", read: false,
        about: { type: "project", id: "sample-bougie-cocooning", label: "Bougie Cocooning", orderId: "sample-order-ambre" },
        text: `Bonjour ${first}, avez-vous pu tester l'échantillon Ambre Doré ? Votre avis m'aidera à préparer la suite.`,
        actions: [
          { label: "Il convient", kind: "feedback-fits", orderId: "sample-order-ambre" },
          { label: "À ajuster", kind: "feedback-adjust", orderId: "sample-order-ambre" },
          { label: "Ne convient pas", kind: "feedback-no", orderId: "sample-order-ambre" },
        ],
      },
    ];
  }

  /* ---------------- API ---------------- */
  function list() {
    const data = load();
    const seeded = seeds().map((m) => ({ ...m, seed: true, read: m.read || data.readSeeds.includes(m.id) }));
    return [...seeded, ...data.added].sort((a, b) => a.date.localeCompare(b.date) || (a.seq || 0) - (b.seq || 0));
  }

  function add(msg) {
    const data = load();
    const m = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: "client", text: "", date: now(), about: null, actions: null, read: false,
      ...msg,
      seq: Date.now(),
    };
    if (m.from === "client") m.read = true; // the client wrote it
    data.added.push(m);
    save(data);
    return m;
  }

  // a system event, never added twice for the same action (key)
  function addSystem(text, about = null, key = null) {
    if (key && load().added.some((m) => m.key === key)) return null;
    return add({ from: "system", text, about, key, read: true });
  }
  // a message from the sales rep (Espace commercial): unread for the client
  const addSales = (text, about = null, extra = {}) => add({ from: "sales", text, about, read: false, ...extra });

  function markAllRead() {
    const data = load();
    data.readSeeds = seeds().map((m) => m.id);
    data.added.forEach((m) => { m.read = true; });
    save(data);
  }

  const unreadCount = () => list().filter((m) => m.from !== "client" && !m.read).length;

  // demo: at most one automatic reply every 2 minutes
  function canAutoReply() {
    return Date.now() - (load().lastAutoReply || 0) > 2 * 60 * 1000;
  }
  function markAutoReply() {
    const data = load();
    data.lastAutoReply = Date.now();
    save(data);
  }

  /* ---------------- for the Espace commercial ---------------- */
  // messages about a project (or one of its orders) + general ones
  function about(projectId, orderIds = []) {
    return list().filter((m) => !m.about || m.about.id === projectId || m.about.orderId === projectId
      || orderIds.includes(m.about.id) || orderIds.includes(m.about.orderId));
  }
  // client messages about this project newer than Claire's last (non automatic) message there
  function waitingForSales(projectId, orderIds = []) {
    const scoped = list().filter((m) => m.about && (m.about.id === projectId || orderIds.includes(m.about.id) || orderIds.includes(m.about.orderId)));
    const lastSales = scoped.filter((m) => m.from === "sales" && !m.auto).map((m) => m.date).sort().pop() || "";
    return scoped.filter((m) => m.from === "client" && m.date > lastSales);
  }

  return { TODAY, list, add, addSystem, addSales, markAllRead, unreadCount, canAutoReply, markAutoReply, about, waitingForSales, isExistingClient: existing };
})();
