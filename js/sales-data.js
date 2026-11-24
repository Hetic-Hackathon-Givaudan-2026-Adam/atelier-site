/* =========================================================
   Givaudan Atelier — sales data (Givaudan side, demo view)
   Shared by the Espace commercial (js/commercial.js) and its Messages page
   (js/commercial-messages.js): leads = the demo client's projects +
   5 fictional clients, with potential, stage, history and the next best
   action. Sales actions: localStorage "givaudanAtelier.salesActions".
   ========================================================= */
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

  /* ---------------- sales actions (localStorage) ---------------- */
  function loadActions() {
    try {
      const v = JSON.parse(localStorage.getItem(ACTIONS_KEY));
      return Array.isArray(v) ? v : [];
    } catch (_) {
      return [];
    }
  }
  function addAction(leadId, type, text = "") {
    const list = loadActions();
    list.push({ leadId, type, date: TODAY, text, at: Date.now() });
    try { localStorage.setItem(ACTIONS_KEY, JSON.stringify(list)); } catch (_) { /* storage blocked */ }
  }

  /* ---------------- 5 fictional clients (same shape as the demo projects) ---------------- */
  function fictionalLeads() {
    const addr = (company, line, city, country = "France") => ({ company, line, city, country });
    return [
      {
        id: "lead-solaria", client: "Solaria Cosmetics", contact: "Léa", contactFull: "Léa Bernard",
        project: {
          id: "solaria-ete-indien", name: "Brume corporelle Été Indien", product: "Brume corporelle", status: "proposed",
          created: ago(1), date: ago(1), potential: "élevé",
          source: { type: "import", fileName: "Solaria_Brief_EteIndien.pdf" },
          brief: { target: "Femmes 25-40 ans", ambiance: ["Évasion", "Douceur"], notes: ["Fruits exotiques", "Fleur de tiaré", "Vanille"], constraints: ["Vegan"], intensity: "Modérée", market: "Monde", volume: "Plus de 10 t", launch: "Moins de 6 mois" },
          blends: blendsOf(["coco-vanille", "ambre-dore", "route-des-epices"]), favorite: null, blend: null,
        },
        orders: [], rejected: [],
      },
      {
        id: "lead-verdane", client: "Maison Verdane", contact: "Paul", contactFull: "Paul Morel",
        project: {
          id: "verdane-foret", name: "Savon solide Forêt", product: "Savon", status: "requested",
          created: ago(21), date: ago(14), potential: "moyen", source: { type: "chat" },
          brief: { target: "Hommes", ambiance: ["Boisé"], notes: ["Bois de cèdre", "Vétiver", "Santal"], constraints: ["Naturel", "Biodégradable"], intensity: "Intense", market: "France", volume: "1 à 10 t", launch: "6 à 12 mois" },
          blends: blendsOf(["cedre-atlas", "santal-cremeux", "vetiver-fume"]), favorite: null, blend: { id: "cedre-atlas", name: "Cèdre de l'Atlas" },
        },
        orders: [{
          id: "verdane-o1", number: "GA-2026-0124", type: "echantillon", reference: "Cèdre de l'Atlas", category: "Savon", quantity: "50 ml",
          orderedAt: ago(14), expectedAt: ago(9), deliveredAt: ago(9), status: "livree",
          address: addr("Maison Verdane", "4 rue des Tanneurs", "69002 Lyon"),
        }],
        rejected: [],
      },
      {
        id: "lead-cleanhome", client: "CleanHome Group", contact: "Karim", contactFull: "Karim Haddad",
        project: {
          id: "cleanhome-alpine", name: "Lessive Fraîcheur Alpine", product: "Lessive", status: "requested",
          created: ago(25), date: ago(3), potential: "élevé", source: { type: "chat" },
          brief: { target: "Familles", ambiance: ["Fraîcheur"], notes: ["Notes vertes", "Agrumes"], constraints: ["Biodégradable"], intensity: "Modérée", market: "Europe", volume: "Plus de 10 t", launch: "6 à 12 mois" },
          blends: blendsOf(["brise-de-calabre", "menthe-givree", "ecume-marine"]), favorite: null, blend: { id: "brise-de-calabre", name: "Brise de Calabre" },
        },
        orders: [{
          id: "cleanhome-o1", number: "GA-2026-0121", type: "echantillon", reference: "Brise de Calabre", category: "Lessive", quantity: "100 ml",
          orderedAt: ago(11), expectedAt: ago(6), deliveredAt: ago(6), status: "livree",
          address: addr("CleanHome Group", "Kungsgatan 12", "111 43 Stockholm", "Suède"),
          feedback: { verdict: "fits", date: ago(3), next: "quote", quote: { volume: "Plus de 10 t", comment: "Lancement prévu au printemps." } },
        }],
        rejected: [],
      },
      {
        id: "lead-nordique", client: "Nordique Spa", contact: "Ingrid", contactFull: "Ingrid Larsen",
        project: {
          id: "nordique-hygge", name: "Bougie Hygge", product: "Bougie", status: "requested",
          created: ago(30), date: ago(8), potential: "faible", source: { type: "chat" },
          brief: { target: "Intérieur cosy", ambiance: ["Douceur"], notes: ["Vanille", "Muscs blancs", "Fleur de coton"], constraints: ["Naturel"], intensity: "Subtile", market: "France", volume: "Moins d'1 t", launch: "Plus de 12 mois" },
          blends: blendsOf(["caramel-beurre-sale", "coco-vanille", "ambre-dore"]), favorite: null, blend: { id: "caramel-beurre-sale", name: "Caramel Beurre Salé" },
        },
        orders: [{
          id: "nordique-o1", number: "GA-2026-0116", type: "echantillon", reference: "Caramel Beurre Salé", category: "Bougie", quantity: "50 ml",
          orderedAt: ago(17), expectedAt: ago(12), deliveredAt: ago(12), status: "livree",
          address: addr("Nordique Spa", "18 quai des Chartrons", "33000 Bordeaux"),
          feedback: { verdict: "no", date: ago(8), reason: ["Trop fort"], note: "", next: null },
        }],
        rejected: ["Caramel Beurre Salé"],
      },
      {
        id: "lead-lumen", client: "Atelier Lumen", contact: "Camille", contactFull: "Camille Roy",
        project: {
          id: "lumen-neroli", name: "Diffuseur Néroli", product: "Parfum d'ambiance", status: "expert",
          created: ago(4), date: ago(2), potential: "moyen",
          source: { type: "import", fileName: "Lumen_brief_diffuseur.docx" },
          brief: { target: "Hôtellerie", ambiance: ["Floral", "Fraîcheur"], notes: ["Néroli", "Fleur d'oranger", "Notes vertes"], constraints: [], intensity: "Subtile", market: "Europe", volume: "1 à 10 t", launch: "Plus de 12 mois" },
          blends: blendsOf(["nuit-de-jasmin", "jardin-de-grasse", "petales-poudres"]), favorite: null, blend: null,
        },
        orders: [], rejected: [],
      },
    ];
  }

  /* ---------------- the demo client (Mira Koné, Maison Koné) ---------------- */
  function demoLeads() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem("givaudanAtelier.session")); } catch (_) { /* ignore */ }
    const first = (s && s.firstName) || "Mira";
    const last = (s && s.lastName) || "Koné";
    const client = (s && s.company) || "Maison Koné";
    const orders = Orders.list({ includeSamples: true });
    const rejected = Store.rejectedBlends();
    return Store.listProjects().map((p) => ({
      id: `client-${p.id}`, client, contact: first, contactFull: `${first} ${last}`, demo: true,
      project: p, orders: orders.filter((o) => o.projectId === p.id), rejected,
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
    if (raw.demo && window.AtelierMessages) {
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
    const leads = [...demoLeads(), ...fictionalLeads()].map((raw) => buildLead(raw, actions));
    // urgent first, then potential, then most recent activity; treated at the bottom
    return leads.sort((a, b) =>
      (a.nba.level === "done") - (b.nba.level === "done")
      || (b.nba.level === "urgent") - (a.nba.level === "urgent")
      || POTENTIAL_RANK[a.potential] - POTENTIAL_RANK[b.potential]
      || b.lastActivity.localeCompare(a.lastActivity));
  }

  /* ================= sales inbox (Claire's side of the conversations) =================
     One conversation per client + project:
     - demo client (Maison Koné): js/messages-store.js grouped by `about`
       (project, or the project of an order); no `about` → "Général";
     - fictional clients: seeds + messages sent here, in "givaudanAtelier.salesInbox"
       (never shown on the client side), + Claire's relances from the drawer.
     Read state (Claire's side) per conversation: inbox.readAt[convId]. */
  const INBOX_KEY = "givaudanAtelier.salesInbox";
  const pad = (n) => String(n).padStart(2, "0");
  const now = () => window.AtelierClock.nowISO();
  const at = (daysAgo, time) => `${Orders.addDays(TODAY, -daysAgo)}T${time}:00`;
  function loadInbox() {
    try {
      const v = JSON.parse(localStorage.getItem(INBOX_KEY));
      return v && Array.isArray(v.added) ? { readAt: {}, ...v } : { added: [], readAt: {} };
    } catch (_) {
      return { added: [], readAt: {} };
    }
  }
  const saveInbox = (v) => { try { localStorage.setItem(INBOX_KEY, JSON.stringify(v)); } catch (_) { /* storage blocked */ } };

  // seen: already read by Claire in the demo story
  function inboxSeeds() {
    return {
      "lead-cleanhome": [
        { id: "ch-1", from: "client", seen: true, date: at(3, "10:05"), text: "Bonjour Claire, nous avons testé Brise de Calabre : il convient parfaitement à notre lessive." },
        { id: "ch-2", from: "sales", date: at(3, "11:20"), text: "Merci Karim, ravie de l'apprendre ! Je prépare la suite avec nos équipes." },
        { id: "ch-3", from: "client", date: at(1, "09:40"), text: "Bonjour Claire, pouvez-vous nous envoyer le devis pour Lessive Fraîcheur Alpine avant vendredi ?" },
      ],
      "lead-solaria": [
        { id: "so-1", from: "client", date: at(1, "16:10"), text: "Bonjour Claire, nous venons de vous transmettre notre brief pour la brume Été Indien, avez-vous des questions ?" },
      ],
      "lead-verdane": [
        { id: "ve-1", from: "client", seen: true, date: at(21, "14:30"), text: "Bonjour Claire, nous lançons un savon solide pour hommes, plutôt boisé. Pouvez-vous nous accompagner ?" },
        { id: "ve-2", from: "sales", date: at(14, "09:15"), text: "Bonjour Paul, votre échantillon Cèdre de l'Atlas part aujourd'hui. Je reste à votre écoute." },
      ],
      "lead-nordique": [
        { id: "no-1", from: "sales", date: at(12, "10:00"), text: "Bonjour Ingrid, votre échantillon Caramel Beurre Salé vient d'être livré. Bonne découverte !" },
        { id: "no-2", from: "client", seen: true, date: at(8, "15:45"), text: "Bonjour Claire, nous avons testé Caramel Beurre Salé : ce n'est pas la bonne direction, trop gourmand pour notre spa." },
      ],
      "lead-lumen": [
        { id: "lu-1", from: "client", seen: true, date: at(2, "11:30"), text: "Bonjour Claire, merci d'avoir transmis notre brief à votre expert. Quand pouvons-nous planifier l'appel ?" },
      ],
    };
  }

  function makeConv(id, lead, messages, info, readAt) {
    messages.sort((a, b) => a.date.localeCompare(b.date));
    const read = readAt[id] || "";
    const unread = messages.filter((m) => m.from === "client" && !m.seen && m.date > read);
    // automatic demo replies do not count as Claire having answered
    const lastReal = [...messages].reverse().find((m) => m.from !== "system" && !m.auto);
    return {
      id, lead, messages, ...info,
      projectName: lead ? lead.project.name : "Général",
      unread: unread.length > 0,
      unreadCount: unread.length,
      toAnswer: Boolean(lastReal && lastReal.from === "client"),
      last: messages[messages.length - 1],
    };
  }

  function conversations(leadsIn) {
    const leads = leadsIn || allLeads();
    const byId = new Map(leads.map((l) => [l.id, l]));
    const inbox = loadInbox();
    const convs = [];
    const M = window.AtelierMessages;
    if (M) {
      const groups = new Map();
      M.list().forEach((m) => {
        let pid = null;
        if (m.about) {
          if (m.about.type === "project") pid = m.about.id;
          else { const o = Orders.find(m.about.id); pid = (o && o.projectId) || m.about.orderId || null; }
        }
        const key = pid && byId.has(`client-${pid}`) ? `client-${pid}` : "client-general";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ ...m });
      });
      let first = "Mira";
      let last = "Koné";
      let company = "Maison Koné";
      try {
        const s = JSON.parse(localStorage.getItem("givaudanAtelier.session")) || {};
        first = s.firstName || first; last = s.lastName || last; company = s.company || company;
      } catch (_) { /* ignore */ }
      groups.forEach((msgs, id) => {
        convs.push(makeConv(id, byId.get(id) || null, msgs, { client: company, contact: first, contactFull: `${first} ${last}`, demo: true }, inbox.readAt));
      });
    }
    const seeds = inboxSeeds();
    leads.filter((l) => !l.demo).forEach((l) => {
      const relances = l.actions.filter((a) => a.type === "relance").map((a) => {
        const d = new Date(a.at || Date.now());
        return { id: `act-${a.at}`, from: "sales", text: a.text, date: `${a.date}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` };
      });
      const msgs = [...(seeds[l.id] || []).map((m) => ({ ...m })), ...inbox.added.filter((m) => m.conv === l.id).map((m) => ({ ...m })), ...relances];
      if (msgs.length) convs.push(makeConv(l.id, l, msgs, { client: l.client, contact: l.contact, contactFull: l.contactFull, demo: false }, inbox.readAt));
    });
    // unread first, then the most recent
    return convs.sort((a, b) => (b.unread - a.unread) || b.last.date.localeCompare(a.last.date));
  }

  function markConversationRead(id) {
    const inbox = loadInbox();
    inbox.readAt[id] = now();
    saveInbox(inbox);
  }

  // Claire answers: the demo client receives it in /messages; fictional ones stay here
  function sendFromSales(conv, text) {
    if (conv.demo) {
      const about = conv.lead ? { type: "project", id: conv.lead.project.id, label: conv.lead.project.name } : null;
      window.AtelierMessages.addSales(text, about);
    } else {
      const inbox = loadInbox();
      inbox.added.push({ id: `s-${Date.now()}`, conv: conv.id, from: "sales", text, date: now() });
      saveInbox(inbox);
    }
    if (conv.lead) addAction(conv.lead.id, "message", text); // "Message envoyé" in the lead history
    markConversationRead(conv.id);
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
