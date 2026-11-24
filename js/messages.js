/* =========================================================
   Givaudan Atelier — Messages (/messages)
   One conversation with the dedicated sales rep (js/messages-store.js),
   shared with the Espace commercial. Protected page (session.js guard).
   ========================================================= */
(() => {
  "use strict";

  const S = window.AtelierSession;
  const session = S && S.get();
  if (!session) return; // session.js already redirected to the login page

  const M = window.AtelierMessages;
  const Orders = window.AtelierOrders;
  const Store = window.AtelierStore;
  const existing = Boolean(session.existingClient);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);
  const SALES_NAME = existing ? "Claire Martin" : "Notre équipe Givaudan Atelier";

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
  const dayOf = (iso) => iso.slice(0, 10);
  const dayLabel = (day) => window.AtelierClock.dayLabel(day);
  const timeOf = (iso) => iso.slice(11, 16).replace(":", " h ");

  /* ---------------- mode: Claire or the team ---------------- */
  if (!existing) {
    $("messages-sub").textContent = "Échangez avec notre équipe.";
    $("msg-claire").hidden = true;
    $("msg-team").hidden = false;
  }

  /* ---------------- "À propos de" links ---------------- */
  function aboutHref(about) {
    if (!about) return null;
    if (about.type === "order") return `commandes#${encodeURIComponent(about.id)}`;
    const p = Store && Store.find(about.id);
    // like Mes projets: a project with proposals is resumed, otherwise its brief
    if (p && p.status === "proposed") return `creer-projet?projet=${encodeURIComponent(about.id)}`;
    return `brief?projet=${encodeURIComponent(about.id)}`;
  }

  const VERDICT_OF = { "feedback-fits": "fits", "feedback-adjust": "adjust", "feedback-no": "no" };
  function actionsBlock(m) {
    const orderId = m.actions[0] && m.actions[0].orderId;
    const order = orderId && Orders.find(orderId);
    if (order && order.feedback) {
      return h("p", { class: "cmsg-done" }, `Avis donné : ${Orders.feedbackLabel(order.feedback)}`);
    }
    return h("div", { class: "cmsg-actions", role: "group", "aria-label": "Votre avis sur l'échantillon" },
      m.actions.map((a) => h("a", {
        class: "chip cmsg-action",
        href: `commandes#avis-${encodeURIComponent(a.orderId)}-${VERDICT_OF[a.kind] || "fits"}`,
      }, a.label)));
  }

  /* ---------------- conversation ---------------- */
  const conv = $("conv");
  function messageItem(m) {
    const about = m.about ? h("a", { class: "cmsg-about", href: aboutHref(m.about) }, "À propos de : ", h("span", {}, m.about.label)) : null;
    // a project tag shows that project's part of the conversation
    if (about && m.about.type === "project" && Store.find(m.about.id)) {
      about.addEventListener("click", (e) => { e.preventDefault(); setFilter(m.about.id, true); });
    }
    if (m.from === "system") {
      return h("li", { class: "cmsg cmsg--system" },
        h("span", { class: "cmsg-sys-icon", "aria-hidden": "true" }, "•"),
        h("span", { class: "sr-only" }, "Événement : "),
        h("span", { class: "cmsg-sys-text" }, m.text),
        about ? h("span", { "aria-hidden": "true" }, " · ") : null, about,
        h("span", { class: "cmsg-time" }, timeOf(m.date)));
    }
    const mine = m.from === "client";
    return h("li", { class: `cmsg cmsg--${mine ? "client" : "sales"}${m.isNew ? " is-new" : ""}` },
      mine ? null : h("span", { class: "cmsg-avatar", "aria-hidden": "true" }, existing ? "CM" : "GA"),
      h("div", { class: "cmsg-col" },
        h("div", { class: "cmsg-bubble" },
          h("p", { class: "cmsg-text" }, h("span", { class: "sr-only" }, mine ? "Vous : " : m.auto ? "Réponse automatique : " : `${SALES_NAME} : `), m.text),
          m.actions && m.actions.length ? actionsBlock(m) : null,
          h("p", { class: "cmsg-meta" }, about, h("span", { class: "cmsg-time" }, timeOf(m.date)))),
        // the demo reply is not Claire's own answer
        m.auto ? h("p", { class: "cmsg-auto", "aria-hidden": "true" }, "Réponse automatique") : null));
  }

  /* ---------------- filter by project + "Rappel du projet" ---------------- */
  let projectFilter = "";
  // the project a message is about (directly, or through one of its orders)
  function projectOf(m) {
    if (!m.about) return null;
    if (m.about.type === "project") return m.about.id;
    const o = Orders.find(m.about.id);
    return (o && o.projectId) || m.about.orderId || null;
  }
  function projectsWithMessages() {
    const ids = [...new Set(M.list().map(projectOf).filter(Boolean))];
    return ids.map((id) => Store.find(id)).filter(Boolean);
  }
  function renderFilter() {
    const wrap = $("conv-filter");
    wrap.textContent = "";
    const projects = projectsWithMessages();
    wrap.hidden = projects.length === 0;
    const chip = (id, label) => h("button", {
      type: "button", class: `chip conv-chip${projectFilter === id ? " is-active" : ""}`, "aria-pressed": String(projectFilter === id),
      onclick: () => setFilter(id, false),
    }, label);
    wrap.append(chip("", "Toute la conversation"), ...projects.map((p) => chip(p.id, p.name)));
  }

  const BADGES = {
    proposed: ["badge--proposed", "Assemblages proposés"], requested: ["badge--requested", "Échantillon demandé"],
    shipped: ["badge--shipped", "Échantillon expédié"], expert: ["badge--expert", "Transmis à un expert"], done: ["badge--done", "Terminé"],
  };
  const ORDER_STATUS = { etude: "En étude", confirmee: "Confirmée", preparation: "En préparation", expediee: "Expédiée", livree: "Livrée" };
  // client voice, never the internal potential
  function renderRecall() {
    const box = $("conv-recall");
    box.textContent = "";
    if (!projectFilter) return;
    const p = Store.find(projectFilter);
    if (!p) return;
    const b = p.brief || {};
    const fields = { product: p.product, target: b.target, market: b.market, ambiance: b.ambiance, notes: b.notes, constraints: b.constraints };
    const [badgeClass, badgeText] = BADGES[p.status] || ["badge--draft", "Brouillon"];
    const order = Orders.latestForProject(p.id, { includeSamples: existing });
    // a chosen blend (project.blend) is not the same as a favourite (project.favorite)
    // the project's own blends first (RAG bank), then the other projects / scenario catalog
    const nameOf = (id) => { const x = window.AtelierStore.findBlend(id, p); return x ? x.name : null; };
    const chosen = p.blend ? (p.blend.name || nameOf(p.blend)) : null;
    const favorite = !chosen && p.favorite ? nameOf(p.favorite) : null;
    box.append(h("section", { class: "crecall rise", "aria-label": `Rappel du projet ${p.name}` },
      h("p", { class: "crecall-eyebrow" }, "Rappel du projet"),
      h("div", { class: "crecall-head" },
        h("p", { class: "crecall-name" }, p.name),
        h("span", { class: `badge ${badgeClass}` }, badgeText)),
      h("p", { class: "crecall-product" }, p.product || ""),
      h("p", { class: "crecall-summary" }, window.AtelierBriefImport ? window.AtelierBriefImport.buildBriefSummary(fields) : ""),
      chosen ? h("p", { class: "crecall-fact" }, h("span", {}, "Assemblage choisi : "), chosen) : null,
      favorite ? h("p", { class: "crecall-fact" }, h("span", {}, "Votre favori : "), favorite) : null,
      order ? h("p", { class: "crecall-fact" }, h("span", {}, "Dernière commande : "), `${order.reference} · ${ORDER_STATUS[order.status] || order.status}`) : null,
      h("p", { class: "crecall-links" },
        h("a", { class: "side-link", href: aboutHref({ type: "project", id: p.id }) }, "Voir le projet ", h("span", { "aria-hidden": "true" }, "→")),
        order ? h("a", { class: "side-link", href: `commandes#${encodeURIComponent(order.id)}` }, "Voir le suivi ", h("span", { "aria-hidden": "true" }, "→")) : null)));
  }

  function setFilter(id, fromTag) {
    projectFilter = id;
    renderFilter();
    renderRecall();
    render();
    // the composer is about that project
    select.value = id && select.querySelector(`option[value="${CSS.escape(`project:${id}`)}"]`) ? `project:${id}` : "";
    const p = id && Store.find(id);
    $("conv-live").textContent = id && p ? `Conversation sur ${p.name}.` : "Toute la conversation.";
    if (fromTag) {
      const active = $("conv-filter").querySelector(".is-active");
      if (active) active.focus({ preventScroll: true });
      $("conv-filter").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }
  }

  function render() {
    conv.textContent = "";
    let day = null;
    M.list().filter((m) => !projectFilter || projectOf(m) === projectFilter).forEach((m) => {
      if (dayOf(m.date) !== day) {
        day = dayOf(m.date);
        conv.append(h("li", { class: "conv-day", role: "presentation" }, h("span", {}, dayLabel(day))));
      }
      conv.append(messageItem(m));
    });
  }

  // the latest message ends just above the sticky composer (never hidden behind it)
  function scrollToEnd(smooth = false) {
    const last = conv.lastElementChild;
    if (!last) return;
    const composer = document.getElementById("mcomposer");
    const visibleBottom = window.innerHeight - (composer ? composer.offsetHeight : 0) - 12;
    const y = window.scrollY + last.getBoundingClientRect().bottom - visibleBottom;
    if (y > window.scrollY) window.scrollTo({ top: y, behavior: smooth && !reduced ? "smooth" : "auto" });
  }

  /* ---------------- composer ---------------- */
  const form = $("mcomposer");
  const text = $("m-text");
  const send = form.querySelector(".mcomposer-send");
  const select = $("m-about");

  function fillAbout() {
    select.textContent = "";
    select.append(h("option", { value: "" }, "Aucun projet en particulier"));
    const projects = existing ? Store.listProjects() : Store.projects();
    if (projects.length) {
      select.append(h("optgroup", { label: "Projets" }, projects.map((p) => h("option", { value: `project:${p.id}` }, p.name))));
    }
    const orders = Orders.list({ includeSamples: existing }).slice(0, 5);
    if (orders.length) {
      select.append(h("optgroup", { label: "Commandes récentes" }, orders.map((o) => h("option", { value: `order:${o.id}` }, `${o.reference} — N° ${o.number}`))));
    }
    // messages#about-order-<id> / #about-project-<id> → pre-selected
    const m = /^#about-(project|order)-(.+)$/.exec(decodeURIComponent(location.hash));
    if (m && select.querySelector(`option[value="${CSS.escape(`${m[1]}:${m[2]}`)}"]`)) select.value = `${m[1]}:${m[2]}`;
  }
  function aboutValue() {
    const [type, id] = select.value.split(/:(.+)/);
    if (!type) return null;
    if (type === "project") {
      const p = Store.find(id);
      return p ? { type, id, label: p.name } : null;
    }
    const o = Orders.find(id);
    return o ? { type, id, label: `${o.reference} — N° ${o.number}` } : null;
  }

  text.addEventListener("input", () => { send.disabled = !text.value.trim(); });
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (text.value.trim()) form.requestSubmit();
    }
  });

  let typingTimer = 0;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = text.value.trim();
    if (!value) return;
    const sentAbout = aboutValue();
    M.add({ from: "client", text: value, about: sentAbout });
    text.value = "";
    send.disabled = true;
    renderFilter(); // a new project may now have messages
    render();
    scrollToEnd(true);
    $("conv-live").textContent = "Message envoyé.";
    // demo: an automatic reply, at most once every 2 minutes
    if (!M.canAutoReply()) return;
    M.markAutoReply();
    const typing = h("li", { class: "cmsg cmsg--sales cmsg--typing" },
      h("span", { class: "cmsg-avatar", "aria-hidden": "true" }, existing ? "CM" : "GA"),
      h("div", { class: "cmsg-bubble" }, h("p", { class: "cmsg-text" }, existing ? "Claire écrit…" : "L'équipe écrit…"),
        h("span", { class: "dots", "aria-hidden": "true" }, h("i"), h("i"), h("i"))));
    conv.append(typing);
    scrollToEnd(true);
    $("conv-live").textContent = existing ? "Claire écrit…" : "L'équipe écrit…";
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      const reply = existing
        ? "Merci pour votre message, je reviens vers vous rapidement. — Claire"
        : "Merci pour votre message, nous revenons vers vous rapidement. — L'équipe Givaudan Atelier";
      // same subject as the client's message, so it stays visible in a project view
      M.add({ from: "sales", text: reply, read: true, auto: true, about: sentAbout });
      render();
      scrollToEnd(true);
      $("conv-live").textContent = `${SALES_NAME} : ${reply}`;
      if (S.renderMessagesBadge) S.renderMessagesBadge();
    }, reduced ? 600 : 1500);
  });

  /* ---------------- start ---------------- */
  fillAbout();
  // messages?projet=<id> (e.g. "Ouvrir la conversation" in Créer un projet) → that project's conversation
  const linkedProject = new URLSearchParams(location.search).get("projet");
  if (linkedProject && Store.find(linkedProject)) setFilter(linkedProject, false);
  else {
    renderFilter();
    render();
  }
  // opening the page reads everything: the header badge disappears
  M.markAllRead();
  const refreshBadge = () => { if (S.renderMessagesBadge) S.renderMessagesBadge(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refreshBadge);
  else refreshBadge();
  requestAnimationFrame(() => scrollToEnd(false));
})();
