/* =========================================================
   Givaudan Atelier — Espace commercial · Messages (Claire Martin's inbox)
   Conversations from js/sales-data.js (demo client: js/messages-store.js,
   shared with the client's /messages; fictional clients: sales inbox).
   Each conversation opens with a "Rappel du projet" card.
   ========================================================= */
(() => {
  "use strict";

  const S = window.AtelierSales;
  const Orders = window.AtelierOrders;
  const BI = window.AtelierBriefImport;
  const { TODAY, LEVELS, norm, catalog } = S;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobileMq = window.matchMedia("(max-width: 760px)");
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
  const potentialBadge = (p) => h("span", { class: `pot pot--${norm(p)}` }, `Potentiel ${p}`);
  const initials = (name) => name.split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase();
  const dayOf = (iso) => iso.slice(0, 10);
  const timeOf = (iso) => iso.slice(11, 16).replace(":", " h ");
  const relDay = (iso) => window.AtelierClock.relativeLabel(iso);
  const STATUS = { etude: "En étude", confirmee: "Confirmée", preparation: "En préparation", expediee: "Expédiée", livree: "Livrée" };

  /* ---------------- toast ---------------- */
  const toastEl = $("toast");
  let toastTimer = 0;
  function toast(text) {
    clearTimeout(toastTimer);
    toastEl.textContent = text;
    toastEl.classList.add("is-visible");
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 3000);
  }

  /* ================= state ================= */
  let convs = [];
  let currentId = null;
  const state = { filter: "all", query: "" };
  const layout = $("smsg-layout");

  function load() {
    convs = S.conversations();
    S.renderSalesBadge();
  }

  /* ================= inbox ================= */
  function preview(c) {
    // automatic replies are ignored: Claire sees the client's last question
    const last = [...c.messages].reverse().find((m) => m.from !== "system" && !m.auto) || c.last;
    const text = String(last.text).replace(/\s+/g, " ");
    return `${last.from === "sales" ? "Vous : " : ""}${text}`;
  }

  function renderInbox() {
    const q = norm(state.query.trim());
    const shown = convs
      .filter((c) => state.filter === "all" || (state.filter === "unread" ? c.unread : c.toAnswer))
      .filter((c) => !q || norm(`${c.client} ${c.contactFull} ${c.projectName}`).includes(q));
    const ul = $("inbox-list");
    ul.textContent = "";
    shown.forEach((c) => {
      const btn = h("button", {
        type: "button", class: `inbox-item${c.unread ? " is-unread" : ""}${c.id === currentId ? " is-current" : ""}`,
        "data-conv": c.id, "aria-current": c.id === currentId ? "true" : null,
        onclick: (e) => openConversation(c.id, { focus: true, from: e.currentTarget }),
      },
        h("span", { class: "inbox-top" },
          c.unread ? h("span", { class: "inbox-dot", "aria-hidden": "true" }) : null,
          c.unread ? h("span", { class: "sr-only" }, "Non lu : ") : null,
          h("span", { class: "inbox-client" }, `${c.client} — ${c.contactFull}`),
          h("span", { class: "inbox-date" }, relDay(c.last.date))),
        h("span", { class: "inbox-project" }, c.projectName, c.lead ? potentialBadge(c.lead.potential) : null),
        h("span", { class: "inbox-preview" }, preview(c)));
      ul.append(h("li", {}, btn));
    });
    $("inbox-empty").hidden = shown.length > 0;
    $("inbox-status").textContent = `${shown.length} conversation${shown.length > 1 ? "s" : ""}`;
    document.querySelectorAll("[data-ifilter]").forEach((ch) => {
      const on = ch.dataset.ifilter === state.filter;
      ch.classList.toggle("is-active", on);
      ch.setAttribute("aria-pressed", String(on));
    });
  }
  document.querySelectorAll("[data-ifilter]").forEach((ch) => ch.addEventListener("click", () => { state.filter = ch.dataset.ifilter; renderInbox(); }));
  $("inbox-search").addEventListener("input", (e) => { state.query = e.target.value; renderInbox(); });

  /* ================= "Rappel du projet" ================= */
  const RECALL_KEY = "atelierSalesRecallOpen"; // per session
  const recallOpen = () => { try { return sessionStorage.getItem(RECALL_KEY) !== "0"; } catch (_) { return true; } };

  // name of a blend reference: the project's own blends (RAG bank) first, then the scenario catalog
  function nameOf(ref, project) {
    if (!ref) return null;
    if (ref.name) return ref.name;
    const b = window.AtelierStore.findBlend(ref, project) || catalog.get(ref);
    return b ? b.name : null;
  }

  function blendOf(lead) {
    const sample = lead.orders.filter((o) => o.type === "echantillon").sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))[0];
    if (sample) return sample.reference.replace(/\s+—\s+version ajustée$/, "");
    const chosen = nameOf(lead.project.blend, lead.project);
    const fav = nameOf(lead.project.favorite, lead.project);
    return chosen || fav || null;
  }

  function recallCard(c) {
    const open = recallOpen();
    const body = h("div", { class: "recall-body", id: "recall-body", hidden: !open });
    const toggle = h("button", { type: "button", class: "recall-toggle", "aria-expanded": String(open), "aria-controls": "recall-body" },
      h("span", {}, "Rappel du projet"), h("span", { class: "recall-chevron", "aria-hidden": "true" }, "⌄"));
    toggle.addEventListener("click", () => {
      const now = body.hidden;
      body.hidden = !now;
      toggle.setAttribute("aria-expanded", String(now));
      try { sessionStorage.setItem(RECALL_KEY, now ? "1" : "0"); } catch (_) { /* ignore */ }
    });

    if (!c.lead) {
      // "Général": the client's projects as small links
      const projects = S.allLeads().filter((l) => l.demo);
      body.append(
        h("p", { class: "recall-name" }, c.client),
        h("p", { class: "recall-sub" }, "Conversation générale, sans projet en particulier."),
        h("ul", { class: "recall-projects", role: "list" }, projects.map((l) => h("li", {},
          h("a", { href: `espace-commercial#lead-${encodeURIComponent(l.id)}` }, l.project.name), potentialBadge(l.potential)))));
      return h("section", { class: "recall", "aria-label": "Rappel du projet" }, toggle, body);
    }

    const l = c.lead;
    const lastOrder = [...l.orders].sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))[0];
    const withFb = l.orders.filter((o) => o.feedback).sort((a, b) => (b.feedback.date || "").localeCompare(a.feedback.date || ""))[0];
    const chosen = nameOf(l.project.blend, l.project);
    const fav = nameOf(l.project.favorite, l.project);
    const row = (label, value) => (value ? h("div", {}, h("dt", {}, label), h("dd", {}, value)) : null);
    body.append(
      h("p", { class: "recall-name" }, l.project.name, h("span", { class: "recall-client" }, ` · ${c.client}`)),
      h("p", { class: "recall-tags" }, h("span", { class: "recall-stage" }, l.stage), potentialBadge(l.potential), l.factors ? h("span", { class: "recall-factors" }, l.factors) : null),
      h("p", { class: "recall-summary" }, BI.buildBriefSummary(l.fields, { voice: "sales" })),
      h("dl", { class: "recall-facts" },
        row(chosen ? "Assemblage choisi" : "Favori du client", chosen || fav),
        row("Dernière commande", lastOrder ? `${lastOrder.reference} · N° ${lastOrder.number} · ${STATUS[lastOrder.status] || lastOrder.status}` : null),
        row("Dernier avis", withFb ? `${withFb.reference} : ${Orders.feedbackLabel(withFb.feedback)}` : null),
        row("Prochaine action", LEVELS[l.nba.level] ? `${l.nba.label} (${LEVELS[l.nba.level].toLowerCase()})` : l.nba.label)),
      h("a", { class: "side-link recall-link", href: `espace-commercial#lead-${encodeURIComponent(l.id)}` }, "Voir la fiche projet ", h("span", { "aria-hidden": "true" }, "→")));
    return h("section", { class: "recall", "aria-label": "Rappel du projet" }, toggle, body);
  }

  /* ================= conversation ================= */
  function messageItem(m, c) {
    const about = m.about && m.about.label ? h("span", { class: "cmsg-about cmsg-about--tag" }, `À propos de : ${m.about.label}`) : null;
    if (m.from === "system") {
      return h("li", { class: "cmsg cmsg--system" },
        h("span", { class: "cmsg-sys-icon", "aria-hidden": "true" }, "•"),
        h("span", { class: "sr-only" }, "Événement : "),
        h("span", { class: "cmsg-sys-text" }, m.text),
        h("span", { class: "cmsg-time" }, timeOf(m.date)));
    }
    const fromClient = m.from === "client";
    return h("li", { class: `cmsg ${fromClient ? "cmsg--them" : "cmsg--me"}` },
      fromClient ? h("span", { class: "cmsg-avatar cmsg-avatar--client", "aria-hidden": "true" }, initials(c.contactFull)) : null,
      h("div", { class: "cmsg-col" },
        h("div", { class: "cmsg-bubble" },
          h("p", { class: "cmsg-text" }, h("span", { class: "sr-only" }, fromClient ? `${c.contactFull} : ` : m.auto ? "Réponse automatique : " : "Vous (Claire Martin) : "), m.text),
          h("p", { class: "cmsg-meta" }, about, h("span", { class: "cmsg-time" }, timeOf(m.date)))),
        // sent by the demo platform, not by Claire
        m.auto ? h("p", { class: "cmsg-auto", "aria-hidden": "true" }, "Réponse automatique (envoyée par la plateforme)") : null));
  }

  function renderConversation(c) {
    $("sconv-placeholder").hidden = true;
    $("sconv-body").hidden = false;
    $("sconv-title").textContent = `${c.projectName} — ${c.client}`;
    const recall = $("recall");
    recall.textContent = "";
    recall.append(recallCard(c));
    const list = $("sconv-list");
    list.textContent = "";
    let day = null;
    c.messages.forEach((m) => {
      if (dayOf(m.date) !== day) {
        day = dayOf(m.date);
        list.append(h("li", { class: "conv-day", role: "presentation" }, h("span", {}, window.AtelierClock.dayLabel(day))));
      }
      list.append(messageItem(m, c));
    });
    $("s-text").placeholder = `Répondre à ${c.contact}…`;
    $("s-text-label").textContent = `Répondre à ${c.contactFull}`;
  }

  function scrollToEnd() {
    const list = $("sconv-list");
    const last = list.lastElementChild;
    if (!last) return;
    const composer = $("scomposer");
    const visibleBottom = window.innerHeight - composer.offsetHeight - 12;
    const y = window.scrollY + last.getBoundingClientRect().bottom - visibleBottom;
    if (y > window.scrollY) window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
  }

  let opener = null;
  // markRead: false for the conversation shown by default (Claire has not opened it yet)
  function openConversation(id, { focus = false, from = null, markRead = true } = {}) {
    let c = convs.find((x) => x.id === id);
    if (!c) return false;
    currentId = id;
    opener = from;
    if (c.unread && markRead) {
      // opening it reads it (Claire's side only)
      S.markConversationRead(id);
      load();
      c = convs.find((x) => x.id === id);
    }
    renderConversation(c);
    renderInbox();
    layout.classList.add("is-conv-open");
    if (history.replaceState) history.replaceState(null, "", `#conv-${encodeURIComponent(id)}`);
    if (focus) {
      $("sconv-title").setAttribute("tabindex", "-1");
      $("sconv-title").focus({ preventScroll: true });
      if (mobileMq.matches) window.scrollTo({ top: 0 });
    }
    requestAnimationFrame(scrollToEnd);
    return true;
  }

  // mobile: back to the inbox
  $("sconv-back").addEventListener("click", () => {
    layout.classList.remove("is-conv-open");
    const btn = document.querySelector(`.inbox-item[data-conv="${CSS.escape(currentId || "")}"]`) || opener;
    if (btn) btn.focus({ preventScroll: false });
  });

  /* ================= composer ================= */
  const form = $("scomposer");
  const area = $("s-text");
  const send = form.querySelector(".mcomposer-send");
  area.addEventListener("input", () => { send.disabled = !area.value.trim(); });
  area.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (area.value.trim()) form.requestSubmit();
    }
  });

  function quickText(kind, c) {
    const hi = `Bonjour ${c.contact},`;
    if (kind === "meeting") return `${hi} je vous propose un point de 20 minutes mercredi à 14 h 30 ou jeudi à 11 h. Qu'est-ce qui vous convient le mieux ?`;
    if (kind === "ack") return `${hi} bien reçu, merci. Je reviens vers vous très rapidement.`;
    const blend = c.lead ? blendOf(c.lead) : null;
    return blend
      ? `${hi} avez-vous pu tester l'échantillon ${blend} ? Votre avis m'aidera à préparer la suite.`
      : `${hi} avez-vous pu tester notre échantillon ? Votre avis m'aidera à préparer la suite.`;
  }
  document.querySelectorAll("[data-quick]").forEach((b) => b.addEventListener("click", () => {
    const c = convs.find((x) => x.id === currentId);
    if (!c) return;
    area.value = quickText(b.dataset.quick, c);
    send.disabled = false;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = area.value.trim();
    const c = convs.find((x) => x.id === currentId);
    if (!text || !c) return;
    S.sendFromSales(c, text);
    area.value = "";
    send.disabled = true;
    load();
    const fresh = convs.find((x) => x.id === currentId);
    renderConversation(fresh);
    renderInbox();
    requestAnimationFrame(scrollToEnd);
    $("sconv-live").textContent = "Message envoyé.";
    toast(`Message envoyé à ${c.contactFull}.`);
  });

  /* ================= start ================= */
  load();
  renderInbox();
  const m = /^#conv-(.+)$/.exec(decodeURIComponent(location.hash));
  if (!(m && openConversation(m[1], { focus: true }))) {
    // desktop: open the first unread conversation; mobile: the inbox first
    const firstUnread = convs.find((c) => c.unread);
    if (firstUnread && !mobileMq.matches) openConversation(firstUnread.id, { markRead: false });
  }
})();
