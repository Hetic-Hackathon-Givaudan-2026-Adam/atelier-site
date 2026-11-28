/* Modèle partagé des projets et de la messagerie commerciale. */
window.AtelierSales = (() => {
  "use strict";

  const Orders = window.AtelierOrders;
  const Store = window.AtelierStore;
  const SC = window.AtelierScenario;
  const AA = window.AtelierAssistant;
  const BI = window.AtelierBriefImport;
  const TODAY = Orders.TODAY;
  const ACTIONS_KEY = "givaudanAtelier.salesActions";
  const SIGNATURE = "Bien cordialement,\nClaire Martin, Responsable de compte — Givaudan";

  const fr = (d) => Orders.frDate(d);
  const frShort = (d) => Orders.frDate(d, { day: "numeric", month: "long" });
  const ago = (n) => Orders.addDays(TODAY, -n);
  // the demo story is told on Orders.TODAY: a project saved later (real clock) is shown on that day
  const isoDay = (d) => {
    const day = Orders.parseDate(d) ? Orders.iso(Orders.parseDate(d)) : TODAY;
    return day > TODAY ? TODAY : day;
  };
  const catalog = new Map([...SC.blends, ...SC.blendCatalog].map((b) => [b.id, b]));
  const blendsOf = (ids) => ids.map((id) => catalog.get(id)).filter(Boolean);
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  function loadActions() {
    return AtelierData.preference("salesActions");
  }

  function addAction(leadId, type, text = "") {
    const list = loadActions();
    list.push({ leadId, type, text, date: new Date().toISOString().slice(0, 10), at: Date.now() });
    return AtelierData.savePreference("salesActions", list);
  }

  function assignedLeads() {
    return Store.listProjects().map((project) => ({
      id: project.id, project, client: project.clientName || "Client",
      contact: project.clientName || "Client", contactFull: project.clientName || "Client",
    }));
  }

  /* ---------------- lead model ---------------- */
  const POTENTIAL_RANK = { "élevé": 0, "moyen": 1, "faible": 2 };
  const LEVELS = {
    urgent: "Urgent", relance: "À relancer", todo: "À traiter", low: "Faible priorité", info: "Suivi", none: "", done: "Traité",
  };

  function retouchLines(rt) {
    if (!rt) return [];
    return [
      rt.adjustments && rt.adjustments.length ? ["Ajustements", rt.adjustments.map((a, i) => (i ? a.toLowerCase() : a)).join(", ")] : null,
      rt.emphasize && rt.emphasize.length ? ["Notes à renforcer", rt.emphasize.join(", ")] : null,
      rt.soften && rt.soften.length ? ["Notes à atténuer", rt.soften.join(", ")] : null,
      rt.note ? ["Précision", `« ${rt.note} »`] : null,
    ].filter(Boolean);
  }

  function buildLead(raw, actionsAll) {
    const p = raw.project;
    const b = p.brief || {};
    const orders = (raw.orders || []).map((o) => Orders.normalize(o));
    const actions = actionsAll.filter((a) => a.leadId === raw.id).sort((x, y) => (x.at || 0) - (y.at || 0));
    const fields = {
      product: p.product || null, target: b.target || null, ambiance: b.ambiance || [], notes: b.notes || [],
      constraints: b.constraints || [], intensity: b.intensity || null, market: b.market || null,
      volume: b.volume || null, launch: b.launch || null,
    };
    // internal potential: stored with the project, otherwise the same rule as assistant.js
    const potential = p.potential || AA.potentialOf(fields);
    const factors = [
      fields.volume ? `Volume ${fields.volume}` : null,
      fields.market,
      fields.launch ? `lancement ${fields.launch.toLowerCase()}` : null,
    ].filter(Boolean).join(" · ");

    // history (client side), newest first later
    const events = [];
    const created = isoDay(p.created || p.date);
    events.push({ date: created, label: p.source && p.source.type === "import" ? `Brief importé : ${p.source.fileName}` : `Projet créé avec l'Atelier : ${p.name}` });
    if (p.status === "expert") events.push({ date: isoDay(p.date), label: "Brief transmis à un expert" });
    orders.forEach((o) => {
      events.push({ date: o.orderedAt, label: `${o.type === "reassort" ? "Réassort" : "Échantillon"} commandé : ${o.reference} · ${o.quantity} (N° ${o.number})` });
      if (o.status === "livree" && o.deliveredAt) events.push({ date: o.deliveredAt, label: `Livré : ${o.reference}` });
      if (o.retouche) events.push({ date: o.retouche.requestedAt || o.orderedAt, label: `Demande de retouche : ${retouchLines(o.retouche).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(" · ") || "précisions transmises"}` });
      o.history.filter((e) => /validée par le parfumeur/i.test(e.label)).forEach((e) => events.push({ date: e.date, label: e.label }));
      if (o.feedback) {
        events.push({ date: o.feedback.date, label: `Avis client sur ${o.reference} : ${Orders.feedbackLabel(o.feedback)}` });
        if (o.feedback.next === "quote") {
          const q = o.feedback.quote || {};
          events.push({ date: o.feedback.date, label: `Devis demandé${q.volume ? ` (volume annuel ${q.volume})` : ""}` });
        }
      }
    });
    events.forEach((e) => { e.date = isoDay(e.date); });
    const lastClient = events.map((e) => e.date).sort().pop() || created;
    // first sentence after the greeting, as a preview of the message
    const preview = (text) => {
      const line = text.replace(/^Bonjour[^\n]*\n+/, "").split("\n")[0].trim();
      return line.length > 90 ? `${line.slice(0, 90).trim()}…` : line;
    };
    const actionLabel = (a) => ({
      relance: `Vous : message envoyé — « ${preview(a.text)} »`,
      message: `Vous : message envoyé — « ${preview(a.text)} »`, // from the Messages page
      quote_sent: "Vous : devis envoyé",
      retouch_validated: "Vous : retouche validée avec le parfumeur",
      done: "Vous : marqué comme traité",
    }[a.type] || `Vous : ${a.type}`);
    actions.forEach((a) => events.push({ date: a.date, label: actionLabel(a), mine: true, at: a.at }));
    events.sort((x, y) => y.date.localeCompare(x.date) || (y.mine ? 1 : 0) - (x.mine ? 1 : 0));

    const lead = {
      ...raw, orders, actions, fields, potential, factors, events, lastClient,
      lastActivity: [lastClient, ...actions.map((a) => a.date)].sort().pop(),
      source: p.source && p.source.type === "import" ? p.source : { type: "chat" },
      blends: p.blends || [],
    };
    // demo client: the conversation of /messages about this project (js/messages-store.js)
    if (window.AtelierMessages) {
      const ids = orders.map((o) => o.id);
      lead.conversation = window.AtelierMessages.about(p.id, ids);
      lead.waiting = window.AtelierMessages.waitingForSales(p.id, ids);
    } else {
      lead.conversation = null;
      lead.waiting = [];
    }
    lead.nba = nextAction(lead);
    lead.stage = stageOf(lead);
    return lead;
  }

  /* ---------------- next best action (first match wins) ---------------- */
  function nextAction(L) {
    const acts = L.actions;
    const lastOf = (type) => acts.filter((a) => a.type === type).map((a) => a.date).sort().pop() || null;
    const done = lastOf("done");
    if (done && done >= L.lastClient && !L.waiting.length) return { kind: "done", level: "done", label: `Traité le ${fr(done)}` };

    // a relance (drawer) or a message (Messages page): the client was contacted
    const contacted = [lastOf("relance"), lastOf("message")].filter(Boolean).sort().pop() || null;
    const contactedRecently = contacted && Orders.daysBetween(contacted, TODAY) < 5; // relance not due again before 5 days
    const samples = L.orders.filter((o) => o.type === "echantillon");
    const quote = L.orders.find((o) => o.feedback && o.feedback.next === "quote");
    if (quote && !lastOf("quote_sent")) return { kind: "quote", level: "urgent", label: "Préparer le devis", order: quote };
    if (quote) return { kind: "quote_follow", level: "info", label: "Suivre le devis", order: quote };
    const fits = L.orders.find((o) => o.feedback && o.feedback.verdict === "fits" && !o.feedback.next);
    if (fits && !contactedRecently) return { kind: "volume", level: "urgent", label: "Proposer la commande en volume", order: fits };
    const study = L.orders.find((o) => o.status === "etude");
    if (study) return { kind: "retouch", level: "urgent", label: "Valider la retouche avec le parfumeur", order: study };
    const waiting = samples
      .filter((o) => o.status === "livree" && !o.feedback && o.deliveredAt)
      .map((o) => ({ o, days: Orders.daysBetween(o.deliveredAt, TODAY) }))
      .filter((x) => x.days >= 5)
      .sort((x, y) => y.days - x.days)[0];
    if (L.waiting.length) return { kind: "reply", level: "todo", label: "Répondre au message du client" };
    if (waiting && !contactedRecently) return { kind: "relance", level: "relance", label: `Relancer : pas d'avis depuis ${waiting.days} jours`, order: waiting.o };
    const expert = L.project.status === "expert" || L.orders.some((o) => o.feedback && o.feedback.next === "expert");
    if (expert) return { kind: "expert", level: "todo", label: "Appeler le client : brief à étudier" };
    if (L.potential === "élevé" && !L.orders.length) return { kind: "contact", level: "todo", label: "Prendre contact : projet à fort potentiel" };
    const no = L.orders.find((o) => o.feedback && o.feedback.verdict === "no");
    if (no && !contactedRecently) return { kind: "redirect", level: "low", label: "Proposer une autre direction", order: no };
    const moving = L.orders.find((o) => ["confirmee", "preparation", "expediee"].includes(o.status));
    if (moving) return { kind: "track", level: "info", label: "Suivre l'envoi", order: moving };
    if (contactedRecently) {
      const how = contacted === lastOf("relance") ? "relancé" : "message envoyé";
      return { kind: "wait", level: "info", label: `Attendre la réponse (${how} le ${frShort(contacted)})` };
    }
    return { kind: "none", level: "none", label: "Aucune action pour le moment" };
  }

  function stageOf(L) {
    if (L.orders.some((o) => o.status === "etude")) return "Retouche en étude";
    if (L.orders.some((o) => o.feedback && o.feedback.next === "quote")) return L.actions.some((a) => a.type === "quote_sent") ? "Devis envoyé" : "Devis demandé";
    if (L.project.status === "expert" || L.orders.some((o) => o.feedback && o.feedback.next === "expert")) return "Transmis à un expert";
    if (L.orders.some((o) => o.feedback)) return "Avis reçu";
    if (L.orders.some((o) => o.type === "reassort")) return "Réassort en cours";
    // the latest sample: delivered (no feedback yet) / shipped / being prepared
    const sample = L.orders.filter((o) => o.type === "echantillon").sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))[0];
    if (sample) {
      if (sample.status === "livree") return "Échantillon livré";
      if (sample.status === "expediee") return "Échantillon envoyé";
      return "En préparation";
    }
    return "Brief reçu";
  }

  function allLeads() {
    const actions = loadActions();
    const leads = assignedLeads().map((raw) => buildLead(raw, actions));
    // urgent first, then potential, then most recent activity; treated at the bottom
    return leads.sort((a, b) =>
      (a.nba.level === "done") - (b.nba.level === "done")
      || (b.nba.level === "urgent") - (a.nba.level === "urgent")
      || POTENTIAL_RANK[a.potential] - POTENTIAL_RANK[b.potential]
      || b.lastActivity.localeCompare(a.lastActivity));
  }

  function conversations(leads = allLeads()) {
    return leads.map((lead) => {
      const messages = window.AtelierMessages.about(lead.project.id);
      const last = messages.at(-1);
      const unreadCount = messages.filter((m) => m.from === "client" && !m.seen).length;
      return {
        id: lead.id, lead, messages, client: lead.client, contact: lead.contact,
        contactFull: lead.contactFull, projectName: lead.project.name,
        unread: unreadCount > 0, unreadCount, toAnswer: last?.from === "client",
        last: last || { date: lead.project.date, text: "", from: "sales" },
      };
    }).sort((a, b) => b.unreadCount - a.unreadCount || b.last.date.localeCompare(a.last.date));
  }

  const markConversationRead = (id) => AtelierData.markRead(id);
  async function sendFromSales(conversation, text) {
    await AtelierData.send(conversation.id, text);
  }

  const unreadConversationCount = () => conversations().filter((c) => c.unread).length;
  // "Messages" tab badge of the Espace commercial header
  function renderSalesBadge() {
    const link = document.querySelector(".sales-tab-msg");
    if (!link) return;
    const n = unreadConversationCount();
    const badge = link.querySelector(".nav-badge");
    badge.textContent = String(n);
    badge.hidden = n === 0;
    link.setAttribute("aria-label", n ? `Messages, ${n} conversation${n > 1 ? "s" : ""} non lue${n > 1 ? "s" : ""}` : "Messages");
  }

  return {
    TODAY, SIGNATURE, LEVELS, POTENTIAL_RANK, catalog,
    fr, frShort, isoDay, norm, retouchLines,
    loadActions, addAction, allLeads,
    conversations, markConversationRead, sendFromSales, unreadConversationCount, renderSalesBadge,
  };
})();
