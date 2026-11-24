/* =========================================================
   Givaudan Atelier — Espace commercial (Givaudan side, demo view)

   Leads = the demo client's projects (Store.listProjects + Orders.list:
   everything done in the client demo shows up here) + 5 fictional clients.
   For each lead: potential (internal), stage, history, and ONE next best
   action computed by rules (first match wins). Sales actions are stored in
   localStorage "givaudanAtelier.salesActions" (cleared by Store.reset()).
   Nothing from this page is ever shown to the client.
   ========================================================= */
(() => {
  "use strict";

  // the lead model lives in js/sales-data.js (shared with the Messages page)
  const S = window.AtelierSales;
  const { TODAY, SIGNATURE, LEVELS, POTENTIAL_RANK, catalog, fr, frShort, norm, retouchLines, loadActions, addAction, allLeads } = S;
  const Orders = window.AtelierOrders;
  const BI = window.AtelierBriefImport;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);

  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    kids.flat().forEach((c) => { if (c != null) el.append(c.nodeType ? c : document.createTextNode(c)); });
    return el;
  }

  // demo dates (js/clock.js): "Aujourd'hui", "Hier", "17 nov."
  const Clock = window.AtelierClock;
  const rel = (d) => { const t = Clock.relativeLabel(d); return /^(Aujourd|Hier)/.test(t) ? t.toLowerCase() : t; };

  /* ================= header: date + KPIs ================= */
  const dateText = Orders.parseDate(TODAY).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  $("day-date").textContent = dateText.charAt(0).toUpperCase() + dateText.slice(1);

  let leads = [];
  const state = { filter: "all", query: "" };

  function renderKpis() {
    const open = leads.filter((l) => l.nba.level !== "done");
    $("kpi-high").textContent = open.filter((l) => l.potential === "élevé").length;
    $("kpi-urgent").textContent = open.filter((l) => l.nba.level === "urgent").length;
    $("kpi-relance").textContent = open.filter((l) => l.nba.level === "relance").length;
    document.querySelectorAll("[data-kpi]").forEach((t) => t.setAttribute("aria-pressed", String(t.dataset.kpi === state.filter)));
  }

  /* ================= list ================= */
  const FILTERS = {
    all: () => true,
    high: (l) => l.potential === "élevé" && l.nba.level !== "done",
    urgent: (l) => l.nba.level === "urgent",
    relance: (l) => l.nba.level === "relance",
    quote: (l) => l.nba.kind === "quote" || l.nba.kind === "quote_follow",
    retouch: (l) => l.orders.some((o) => o.retouche),
    expert: (l) => l.nba.kind === "expert",
  };
  const potentialBadge = (p) => h("span", { class: `pot pot--${norm(p)}` }, `Potentiel ${p}`);
  const sourceTag = (l) => h("span", { class: "lead-source" }, l.source.type === "import" ? "Brief importé" : "Conversation");
  const actionButtonLabel = (nba) => ({
    quote: "Préparer le devis", volume: "Rédiger une relance", relance: "Rédiger une relance", redirect: "Rédiger une relance",
    retouch: "Voir la retouche", expert: "Voir le brief", contact: "Voir le brief", reply: "Répondre",
  }[nba.kind] || "Voir le projet");

  function leadCard(l, i) {
    const open = (e) => openLead(l.id, e.currentTarget, ["volume", "relance", "redirect"].includes(l.nba.kind), l.nba.kind === "reply" ? "#ld-reply" : null);
    return h("li", { class: `lead lead--${l.nba.level}`, "data-id": l.id, style: `--d: ${0.05 * i}s` },
      h("div", { class: "lead-main" },
        h("div", { class: "lead-top" }, h("span", { class: "lead-client" }, l.client), potentialBadge(l.potential), sourceTag(l),
          l.waiting.length ? h("span", { class: "lead-new" }, "Nouveau message") : null,
          l.waiting.length ? h("a", { class: "lead-conv-link", href: `commercial-messages#conv-${encodeURIComponent(l.id)}` }, "Ouvrir la conversation →") : null),
        h("h3", { class: "lead-project" },
          h("button", { type: "button", class: "lead-open", "aria-haspopup": "dialog", onclick: (e) => openLead(l.id, e.currentTarget) }, l.project.name)),
        h("p", { class: "lead-meta" }, l.fields.product || "Projet", h("span", { "aria-hidden": "true" }, " · "), l.stage,
          h("span", { "aria-hidden": "true" }, " · "), `Dernière activité : ${rel(l.lastActivity)}`)),
      h("div", { class: "lead-action" },
        h("p", { class: `nba nba--${l.nba.level}` },
          LEVELS[l.nba.level] ? h("span", { class: "nba-level" }, LEVELS[l.nba.level]) : null,
          h("strong", { class: "nba-label" }, l.nba.label)),
        // "Répondre au message du client" opens that conversation on the Messages page
        l.nba.kind === "reply"
          ? h("a", { class: "btn btn-small btn-outline", href: `commercial-messages#conv-${encodeURIComponent(l.id)}` },
            "Répondre", h("span", { class: "sr-only" }, ` — ${l.client}, ${l.project.name}`))
          : l.nba.level !== "done" && l.nba.kind !== "none"
          ? h("button", { type: "button", class: `btn btn-small ${l.nba.level === "urgent" ? "btn-primary" : "btn-outline"}`, "aria-haspopup": "dialog", onclick: open },
            actionButtonLabel(l.nba), h("span", { class: "sr-only" }, ` — ${l.client}, ${l.project.name}`))
          : null));
  }

  function renderList() {
    const q = norm(state.query.trim());
    const shown = leads.filter(FILTERS[state.filter] || FILTERS.all)
      .filter((l) => !q || norm(`${l.client} ${l.project.name} ${l.fields.product}`).includes(q));
    const ul = $("lead-list");
    ul.textContent = "";
    shown.forEach((l, i) => ul.append(leadCard(l, i)));
    $("leads-empty").hidden = shown.length > 0;
    $("leads-status").textContent = `${shown.length} projet${shown.length > 1 ? "s" : ""} affiché${shown.length > 1 ? "s" : ""}`;
    document.querySelectorAll("[data-filter]").forEach((c) => {
      const on = c.dataset.filter === state.filter;
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-pressed", String(on));
    });
    $("lead-active-filter").hidden = state.filter !== "high";
  }

  function refresh() {
    leads = allLeads();
    renderKpis();
    renderList();
    S.renderSalesBadge(); // "Messages" tab of the header
  }

  function setFilter(f) {
    state.filter = f;
    renderKpis();
    renderList();
  }
  document.querySelectorAll("[data-filter]").forEach((c) => c.addEventListener("click", () => setFilter(c.dataset.filter)));
  document.querySelectorAll("[data-kpi]").forEach((t) => t.addEventListener("click", () => {
    setFilter(state.filter === t.dataset.kpi ? "all" : t.dataset.kpi);
    $("lead-list").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }));
  $("lead-filter-clear").addEventListener("click", () => { setFilter("all"); $("lead-search").focus(); });
  $("lead-search").addEventListener("input", (e) => { state.query = e.target.value; renderList(); });

  /* ================= toast ================= */
  const toast = $("toast");
  let toastTimer = 0;
  function showToast(text) {
    clearTimeout(toastTimer);
    toast.textContent = text;
    toast.classList.add("is-visible");
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
  }

  /* ================= drawer (focus trap, Escape, click outside) ================= */
  const drawerRoot = $("lead-drawer");
  const drawerPanel = drawerRoot.querySelector(".drawer-panel");
  let opener = null;
  let drawerTimer = 0;
  let currentId = null;
  function openDrawer(from) {
    clearTimeout(drawerTimer);
    opener = from || document.activeElement;
    drawerRoot.hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => requestAnimationFrame(() => drawerRoot.classList.add("is-open")));
  }
  function closeDrawer() {
    if (drawerRoot.hidden) return;
    drawerRoot.classList.remove("is-open");
    document.body.classList.remove("modal-open");
    drawerTimer = setTimeout(() => { drawerRoot.hidden = true; }, reduced ? 0 : 500);
    currentId = null;
    // the card may have been rebuilt: focus its button again
    const target = opener && document.contains(opener) ? opener
      : document.querySelector(`.lead[data-id="${CSS.escape(opener && opener.dataset ? opener.dataset.leadId || "" : "")}"] .lead-open`);
    if (target) target.focus({ preventScroll: true });
  }
  drawerRoot.querySelectorAll("[data-lead-close]").forEach((el) => el.addEventListener("click", closeDrawer));
  document.addEventListener("keydown", (e) => {
    if (drawerRoot.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); closeDrawer(); return; }
    if (e.key !== "Tab") return;
    const items = Array.from(drawerPanel.querySelectorAll("a[href], button:not([disabled]), textarea, input")).filter((x) => x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !drawerPanel.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !drawerPanel.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  });

  /* ================= lead detail ================= */
  // blend the conversation is about: the latest sample, otherwise the chosen / first blend
  function blendName(l) {
    const order = (l.nba.order) || l.orders.find((o) => o.type === "echantillon");
    if (order) return order.reference.replace(/\s+—\s+version ajustée$/, "");
    const chosen = l.project.blend;
    const found = chosen && (chosen.name ? chosen : window.AtelierStore.findBlend(chosen, l.project) || catalog.get(chosen));
    return (found && found.name) || (l.blends[0] || {}).name || l.project.name;
  }

  function draftMessage(l) {
    const hi = `Bonjour ${l.contact},`;
    const blend = blendName(l);
    const others = l.blends.filter((b) => b.name !== blend && !l.rejected.includes(b.name)).slice(0, 2).map((b) => b.name);
    let body;
    switch (l.nba.kind) {
      case "volume":
        body = `ravie que ${blend} vous convienne. Je vous propose de préparer ensemble le passage en production : volumes, calendrier de lancement et conditionnement. Seriez-vous disponible cette semaine pour un point de 20 minutes ?`;
        break;
      case "redirect":
        body = `merci pour votre retour sur ${blend}. Je vous propose deux nouvelles directions, plus proches de vos attentes${others.length ? ` : ${others.join(" et ")}` : ""}. Je peux vous faire parvenir des échantillons dès cette semaine.`;
        break;
      case "quote":
      case "quote_follow":
        body = `suite à votre demande, vous trouverez ci-joint notre proposition de devis pour ${blend}${(l.nba.order && l.nba.order.feedback.quote && l.nba.order.feedback.quote.volume) ? ` (volume annuel : ${l.nba.order.feedback.quote.volume})` : ""}. Je reste à votre disposition pour en parler.`;
        break;
      case "retouch":
        body = `nos parfumeurs ont bien reçu votre demande de retouche sur ${blend}. Ils la valident aujourd'hui et votre échantillon retouché part en préparation : vous le recevrez sous 5 jours ouvrés.`;
        break;
      case "expert":
      case "contact":
        body = `merci pour votre brief « ${l.project.name} ». Je l'ai étudié avec nos parfumeurs et je vous propose un échange de 20 minutes pour affiner la direction olfactive. Quelles sont vos disponibilités cette semaine ?`;
        break;
      case "track":
        body = `votre commande ${l.nba.order ? `${l.nba.order.reference} (N° ${l.nba.order.number})` : ""} est en route. Je reste disponible si vous avez la moindre question à réception.`;
        break;
      default:
        body = `avez-vous pu tester l'échantillon ${blend} ? Votre avis nous aidera à préparer la suite : production, ajustement ou nouvelle piste. Je reste disponible pour en parler.`;
    }
    return `${hi}\n\n${body.charAt(0).toUpperCase() + body.slice(1)}\n\n${SIGNATURE}`;
  }

  function section(title, ...content) {
    const id = `ld-${title.replace(/\W+/g, "-").toLowerCase()}`;
    return h("section", { class: "ld-section", "aria-labelledby": id }, h("h3", { class: "ld-h3", id }, title), ...content);
  }

  function renderDetail(l, { compose = false, focusSel = null } = {}) {
    const root = $("lead-detail");
    root.textContent = "";
    const f = l.fields;
    const join = (v) => (Array.isArray(v) ? v.join(", ") : v);
    const fieldRow = (label, value) => h("div", {}, h("dt", {}, label), h("dd", {}, value && (!Array.isArray(value) || value.length) ? join(value) : "—"));

    // head
    root.append(
      h("span", { class: "eyebrow" }, l.client),
      h("h2", { class: "drawer-title", id: "lead-title" }, l.project.name),
      h("div", { class: "ld-head" }, potentialBadge(l.potential), h("span", { class: "ld-stage" }, l.stage), sourceTag(l)),
      l.factors ? h("p", { class: "ld-factors" }, l.factors) : null,
      h("p", { class: `nba nba--${l.nba.level} ld-nba` },
        LEVELS[l.nba.level] ? h("span", { class: "nba-level" }, LEVELS[l.nba.level]) : null,
        h("strong", { class: "nba-label" }, l.nba.label)));

    // actions
    const actions = h("div", { class: "ld-actions" });
    const composer = h("div", { class: "ld-composer", hidden: !compose });
    const draft = h("textarea", { class: "fb-input ld-message", id: "ld-message", rows: "9", "aria-label": `Message à ${l.contactFull}` });
    draft.value = draftMessage(l);
    composer.append(
      h("label", { class: "ld-label", for: "ld-message" }, `Message à ${l.contactFull} (${l.client})`),
      draft,
      h("div", { class: "fb-actions" },
        h("button", { type: "button", class: "btn btn-primary btn-small", onclick: () => sendMessage(l, draft.value) }, "Envoyer"),
        h("button", { type: "button", class: "btn btn-outline btn-small", onclick: () => copyText(draft) }, "Copier le texte")));
    const writeBtn = h("button", { type: "button", class: "btn btn-outline btn-small ld-write", "aria-expanded": String(compose), "aria-controls": "ld-composer" }, "Rédiger une relance");
    composer.id = "ld-composer";
    writeBtn.addEventListener("click", () => {
      const openNow = composer.hidden;
      composer.hidden = !openNow;
      writeBtn.setAttribute("aria-expanded", String(openNow));
      if (openNow) draft.focus();
    });
    if (l.nba.kind === "quote") actions.append(h("button", { type: "button", class: "btn btn-primary btn-small", onclick: () => doAction(l, "quote_sent") }, "Marquer le devis comme envoyé"));
    if (l.nba.kind === "retouch") actions.append(h("button", { type: "button", class: "btn btn-primary btn-small", onclick: () => validateRetouch(l) }, "Valider la retouche"));
    actions.append(writeBtn);
    if (!["quote", "retouch", "done"].includes(l.nba.kind)) {
      actions.append(h("button", { type: "button", class: "btn btn-outline btn-small", onclick: () => doAction(l, "done") }, "Marquer comme traité"));
    }
    root.append(actions, composer);

    // demo client: the /messages conversation about this project + a reply box
    if (l.conversation) {
      const replyArea = h("textarea", { class: "fb-input ld-reply", id: "ld-reply", rows: "3", placeholder: "Votre réponse…" });
      const replyBtn = h("button", { type: "button", class: "btn btn-primary btn-small", disabled: true }, "Envoyer");
      replyArea.addEventListener("input", () => { replyBtn.disabled = !replyArea.value.trim(); });
      replyBtn.addEventListener("click", () => {
        const text = replyArea.value.trim();
        if (!text) return;
        window.AtelierMessages.addSales(text, aboutProject(l));
        afterAction(l.id, `Réponse envoyée à ${l.contactFull}.`);
      });
      const who = (m) => (m.from === "client" ? l.contactFull : m.from === "sales" ? (m.auto ? "Réponse automatique" : "Claire Martin (vous)") : "Événement");
      root.append(section("Messages",
        l.conversation.length
          ? h("ol", { class: "ld-messages" }, l.conversation.slice(-8).map((m) => h("li", { class: `ld-msg ld-msg--${m.from}${l.waiting.includes(m) || l.waiting.some((w) => w.id === m.id) ? " is-new" : ""}` },
            h("span", { class: "ld-msg-who" }, `${who(m)} · ${Clock.relativeLabel(m.date)}`),
            h("span", { class: "ld-msg-text" }, m.text))))
          : h("p", { class: "ld-sub" }, "Aucun message pour ce projet."),
        h("a", { class: "lead-conv-link ld-conv-link", href: `commercial-messages#conv-${encodeURIComponent(l.id)}` }, "Ouvrir la conversation →"),
        h("label", { class: "ld-label", for: "ld-reply" }, `Répondre à ${l.contact}`),
        replyArea,
        h("div", { class: "fb-actions" }, replyBtn)));
    }

    // retouch request
    const rtOrder = l.orders.find((o) => o.retouche && o.status === "etude") || l.orders.find((o) => o.retouche);
    if (rtOrder) {
      root.append(section("Demande de retouche",
        h("p", { class: "ld-sub" }, `${rtOrder.reference} · N° ${rtOrder.number} · ${rtOrder.status === "etude" ? "en étude" : "validée"}`),
        h("dl", { class: "ld-fields" }, retouchLines(rtOrder.retouche).map(([k, v]) => fieldRow(k, v)))));
    }

    // brief in 30 seconds
    root.append(section("Le brief en 30 secondes",
      // always written from the fields, in the third person (never the client's own text)
      h("p", { class: "ld-summary" }, BI.buildBriefSummary(f, { voice: "sales" })),
      h("dl", { class: "ld-fields" },
        fieldRow("Produit", f.product), fieldRow("Cible", f.target), fieldRow("Ambiance", f.ambiance), fieldRow("Notes", f.notes),
        fieldRow("Exigences", f.constraints), fieldRow("Intensité", f.intensity), fieldRow("Marché", f.market),
        fieldRow("Volume annuel", f.volume), fieldRow("Lancement", f.launch)),
      h("p", { class: "ld-sub" }, l.source.type === "import" ? `Brief importé : ${l.source.fileName}` : "Conversation avec l'Atelier")));

    // blends
    const chosenId = l.project.blend && (l.project.blend.id || l.project.blend);
    root.append(section("Assemblages",
      l.blends.length
        ? h("ul", { class: "ld-blends", role: "list" }, l.blends.map((b) => {
          const toConfirm = window.AtelierStore.splitBlendTags(b).toConfirm;
          return h("li", {},
            h("span", { class: "ld-blend-name" }, b.name), h("span", { class: "ld-blend-family" }, b.family),
            b.id === chosenId ? h("span", { class: "ld-flag" }, "Choisi") : b.id === l.project.favorite ? h("span", { class: "ld-flag" }, "Favori") : null,
            l.rejected.includes(b.name) ? h("span", { class: "ld-flag ld-flag--no" }, "Refusé") : null,
            // internal: the bank reference and what the perfumers still have to confirm
            b.technicalName ? h("span", { class: "ld-blend-ref" }, `Réf. banque : ${b.technicalName}`) : null,
            toConfirm.length ? h("span", { class: "ld-blend-ref" }, `À confirmer par nos experts : ${toConfirm.join(", ")}`) : null);
        }))
        : h("p", { class: "ld-sub" }, "Aucun assemblage proposé pour l'instant."),
      l.rejected.length ? h("p", { class: "ld-rejected" }, h("span", { class: "ld-label" }, "Refusés par le client : "), l.rejected.join(", ")) : null));

    // history
    root.append(section("Historique du client",
      h("ol", { class: "history ld-history" }, l.events.map((e) => h("li", { class: e.mine ? "is-mine" : null },
        h("span", { class: "history-date" }, Clock.relativeLabel(e.date)), h("span", { class: "history-label" }, e.label))))));

    const target = focusSel ? root.querySelector(focusSel) : compose ? draft : root.querySelector("#lead-title");
    if (target) {
      // a heading / paragraph can take the focus programmatically
      if (!target.matches("button, a[href], input, textarea, select")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
  }

  function openLead(id, from, compose = false, focusSel = null) {
    const l = leads.find((x) => x.id === id);
    if (!l) return;
    currentId = id;
    if (from && from.dataset) from.dataset.leadId = id;
    openDrawer(from);
    drawerPanel.scrollTop = 0;
    renderDetail(l, { compose, focusSel });
  }
  // what a message from Claire is about (shown as "À propos de" on the client side)
  function aboutProject(l) {
    const order = l.nba.order || l.orders.find((o) => o.type === "echantillon");
    return { type: "project", id: l.project.id, label: l.project.name, orderId: order ? order.id : undefined };
  }

  // after an action: rebuild the list and the open detail
  function afterAction(id, message) {
    refresh();
    const l = leads.find((x) => x.id === id);
    if (l && currentId === id) renderDetail(l, { focusSel: ".ld-nba" });
    if (message) showToast(message);
  }

  function sendMessage(l, text) {
    if (!text.trim()) return;
    addAction(l.id, "relance", text.trim());
    // the demo client receives it in /messages (fictional leads: local history only)
    if (l.demo && window.AtelierMessages) window.AtelierMessages.addSales(text.trim(), aboutProject(l));
    afterAction(l.id, `Message envoyé à ${l.client}.`);
  }
  function doAction(l, type) {
    addAction(l.id, type);
    afterAction(l.id, type === "quote_sent" ? `Devis marqué comme envoyé à ${l.client}.` : `${l.project.name} : marqué comme traité.`);
  }
  // the retouch order goes from "En étude" to "Confirmée" — visible in Mes commandes
  function validateRetouch(l) {
    const o = l.nba.order;
    if (!o) return;
    Orders.update(o.id, { status: "confirmee", history: [...o.history, { date: TODAY, label: "Retouche validée par le parfumeur" }] });
    addAction(l.id, "retouch_validated");
    if (l.demo && window.AtelierMessages) window.AtelierMessages.addSystem(`Retouche validée par le parfumeur — N° ${o.number}`, { type: "order", id: o.id, label: `${o.reference} — N° ${o.number}` }, `retouch-ok:${o.number}`);
    afterAction(l.id, "La retouche est validée : la commande est confirmée.");
  }
  function copyText(area) {
    const fallback = () => { area.focus(); area.select(); showToast("Texte sélectionné : copiez-le avec Ctrl+C."); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(area.value).then(() => showToast("Texte copié."), fallback);
      } else fallback();
    } catch (_) {
      fallback();
    }
  }

  refresh();

  // espace-commercial#lead-<id> ("Voir la fiche projet" from the Messages page): open its drawer
  function openFromHash() {
    const m = /^#lead-(.+)$/.exec(decodeURIComponent(location.hash));
    if (!m) return;
    const card = document.querySelector(`.lead[data-id="${CSS.escape(m[1])}"] .lead-open`);
    if (card) openLead(m[1], card);
  }
  openFromHash();
  window.addEventListener("hashchange", openFromHash);
})();
