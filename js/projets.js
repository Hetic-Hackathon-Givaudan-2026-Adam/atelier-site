/* =========================================================
   Givaudan Atelier — Mes projets (front-end prototype)
   ========================================================= */
(() => {
  "use strict";

  const S = window.AtelierSession;
  const session = S && S.get();
  if (!session) return; // session.js already redirected to the login page

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const space = document.getElementById("space");

  /* ---------------- Personalisation ---------------- */
  document.querySelectorAll("[data-first-name]").forEach((el) => { el.textContent = session.firstName; });

  /* ---------------- Existing client / new client ---------------- */
  const demoButtons = Array.from(document.querySelectorAll("[data-demo]"));
  let switchTimer = 0;

  function render(existing) {
    document.querySelectorAll("[data-mode]").forEach((el) => {
      el.hidden = el.dataset.mode !== (existing ? "client" : "new");
    });
    demoButtons.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.demo === "client") === existing)));
    document.title = existing ? "Mes projets — Givaudan Atelier" : "Bienvenue — Givaudan Atelier";
    const status = document.querySelector(".account-status");
    if (status) status.textContent = existing ? "Client Givaudan" : "Nouveau client";
  }

  function setMode(existing) {
    S.update({ existingClient: existing });
    clearTimeout(switchTimer);
    if (reduced) { render(existing); return; }
    space.classList.add("is-switching");
    switchTimer = setTimeout(() => {
      render(existing);
      requestAnimationFrame(() => space.classList.remove("is-switching"));
    }, 350);
  }

  render(session.existingClient);
  demoButtons.forEach((b) => {
    b.addEventListener("click", () => {
      const existing = b.dataset.demo === "client";
      if ((S.get() || {}).existingClient !== existing) setMode(existing);
    });
  });

  /* ---------------- Projects & orders (rendered from data) ----------------
     Store.listProjects() merges the sample projects and the saved ones BY ID
     (saved version wins), so a resumed sample project appears only once. */
  const Store = window.AtelierStore;
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const frDate = (iso) => window.AtelierClock.dateLabel(iso); // demo date (js/clock.js)

  const BADGES = {
    proposed: ["badge--proposed", "Assemblages proposés"],
    requested: ["badge--requested", "Échantillon demandé"],
    shipped: ["badge--shipped", "Échantillon expédié"],
    expert: ["badge--expert", "Transmis à un expert"],
    done: ["badge--done", "Terminé"],
  };
  // Brouillon → Assemblages → Échantillon demandé → Expédié
  const PROGRESS = {
    proposed: [2, "Étape 2 sur 4 : assemblages proposés"],
    requested: [3, "Étape 3 sur 4 : échantillon demandé"],
    shipped: [4, "Étape 4 sur 4 : échantillon expédié"],
    done: [5, "Projet terminé"],
  };

  function projectCard(p) {
    const li = el("li", p.sample ? "project" : "project project--new");
    li.dataset.state = p.status === "done" ? "done" : "active";
    li.dataset.projectId = p.id;

    const [badgeClass, badgeText] = BADGES[p.status] || ["badge--draft", "Brouillon"];
    const top = el("div", "project-top");
    const product = el("span", "project-product", p.product || "Projet");
    if (p.source && p.source.type === "import") product.append(el("span", "project-source", "Brief importé"));
    top.append(product, el("span", `badge ${badgeClass}`, badgeText));
    li.append(top, el("h3", "project-name", p.name));

    const shown = (p.blend && p.blend.name ? p.blend : null) || p.cardBlend || null;
    const blend = el("p", shown ? "project-blend" : "project-blend project-blend--pending");
    if (shown) blend.append(el("span", "blend-name", shown.name), el("span", "blend-notes", shown.notes || ""));
    else blend.textContent = p.pendingText || (p.contact ? `Brief transmis à ${p.contact}` : "Brief transmis à nos experts");
    li.append(blend);

    const progress = PROGRESS[p.status];
    if (progress) {
      const [step, label] = progress;
      const bar = el("div", step > 4 ? "progress progress--complete" : "progress");
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", label);
      for (let i = 1; i <= 4; i++) bar.append(el("span", i < step ? "is-done" : i === step ? "is-current" : null));
      li.append(bar);
      if (step <= 4) {
        const labels = el("ol", "progress-labels");
        labels.setAttribute("aria-hidden", "true");
        ["Brouillon", "Assemblages", "Échantillon demandé", "Expédié"].forEach((t) => labels.append(el("li", null, t)));
        li.append(labels);
      }
    }

    const foot = el("div", "project-foot");
    const updated = p.created && p.created.slice(0, 10) !== String(p.date).slice(0, 10);
    foot.append(el("span", "project-date", `${updated ? "Mis à jour" : "Créé"} le ${frDate(p.date)}`));
    const action = el("a", "project-action");
    const id = encodeURIComponent(p.id);
    let sr = ` du projet ${p.name}`;
    if (p.status === "proposed") { action.href = `creer-projet?projet=${id}`; action.append("Reprendre"); sr = ` le projet ${p.name}`; }
    else if (p.status === "expert") { action.href = `brief?projet=${id}`; action.append("Voir le brief"); }
    else if (p.status === "done") {
      // "Recommander" → reorder modal prefilled with the latest order of this project
      const order = Orders.latestForProject(p.id);
      action.href = order ? `commandes#recommander-${encodeURIComponent(order.id)}` : "commandes#recommander";
      action.append("Recommander");
      sr = ` ${shown ? shown.name : p.name}`;
    }
    else {
      // "Voir le suivi" → the latest order of this project on Mes commandes
      const order = Orders.latestForProject(p.id);
      action.href = order ? `commandes#${encodeURIComponent(order.id)}` : "commandes";
      action.append("Voir le suivi");
    }
    action.append(el("span", "sr-only", sr), " ");
    const arrow = el("span", null, "→");
    arrow.setAttribute("aria-hidden", "true");
    action.append(arrow);
    foot.append(action);
    li.append(foot);
    return li;
  }

  // orders (js/orders.js) give the "Voir le suivi" / "Recommander" links of the cards;
  // order tracking itself lives in Mes commandes
  const Orders = window.AtelierOrders;

  const projectList = document.querySelector(".project-list");
  let currentFilter = "active";

  function renderLists() {
    projectList.textContent = "";
    Store.listProjects().forEach((p) => {
      const card = projectCard(p);
      if (card.dataset.state !== currentFilter) card.classList.add("is-gone", "is-filtered-out");
      projectList.append(card);
    });
  }
  renderLists();

  /* ---------------- Project filters ---------------- */
  const chips = Array.from(document.querySelectorAll(".projects .chip"));
  const allProjects = () => Array.from(document.querySelectorAll(".project")).filter((p) => !p.hidden);
  const status = document.getElementById("projects-status");
  const FADE = reduced ? 0 : 320;
  let filterTimer = 0;

  function applyFilter(state) {
    currentFilter = state;
    const projects = allProjects();
    chips.forEach((c) => {
      const on = c.dataset.filter === state;
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-pressed", String(on));
    });
    projects.forEach((p) => { if (p.dataset.state !== state) p.classList.add("is-filtered-out"); });
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      projects.forEach((p) => {
        const match = p.dataset.state === state;
        p.classList.toggle("is-gone", !match);
        if (match) {
          p.classList.add("is-filtered-out");
          requestAnimationFrame(() => requestAnimationFrame(() => p.classList.remove("is-filtered-out")));
        }
      });
    }, FADE);
    const n = projects.filter((p) => p.dataset.state === state).length;
    status.textContent = `${n} projet${n > 1 ? "s" : ""} ${state === "active" ? "en cours" : n > 1 ? "terminés" : "terminé"}`;
  }

  // counts include the projects created in the prototype
  function updateCounts() {
    const projects = allProjects();
    chips.forEach((c) => {
      const count = c.querySelector(".chip-count");
      if (count) count.textContent = projects.filter((p) => p.dataset.state === c.dataset.filter).length;
    });
  }
  updateCounts();

  chips.forEach((chip) => chip.addEventListener("click", () => applyFilter(chip.dataset.filter)));

  /* ---------------- Toast ---------------- */
  const toast = document.getElementById("toast");
  let toastTimer = 0;
  function showToast(text) {
    clearTimeout(toastTimer);
    toast.textContent = text;
    toast.classList.add("is-visible");
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
  }

  /* ---------------- Réinitialiser la démo ---------------- */
  const resetBtn = document.getElementById("demo-reset");
  const resetModal = document.getElementById("reset-modal");
  const resetDialog = resetModal.querySelector(".modal-dialog");
  let modalTimer = 0;

  function openReset() {
    clearTimeout(modalTimer);
    resetModal.hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => requestAnimationFrame(() => resetModal.classList.add("is-open")));
    // the safe choice gets the focus first
    resetModal.querySelector(".btn-outline").focus({ preventScroll: true });
  }
  function closeReset(restoreFocus = true) {
    if (resetModal.hidden) return;
    resetModal.classList.remove("is-open");
    document.body.classList.remove("modal-open");
    modalTimer = setTimeout(() => { resetModal.hidden = true; }, reduced ? 0 : 600);
    if (restoreFocus) resetBtn.focus({ preventScroll: true });
  }

  function resetDemo() {
    // clear the saved data, then rebuild both lists: only the samples remain
    Store.reset();
    renderLists();
    updateCounts();
    applyFilter("active");
    if (!(S.get() || {}).existingClient) setMode(true);
    closeReset();
    showToast("Démo réinitialisée.");
    // the seed messages are back: refresh the header badge
    if (S.renderMessagesBadge) S.renderMessagesBadge();
  }

  resetBtn.addEventListener("click", openReset);
  document.getElementById("reset-confirm").addEventListener("click", resetDemo);
  resetModal.querySelectorAll("[data-reset-close]").forEach((n) => n.addEventListener("click", () => closeReset()));
  document.addEventListener("keydown", (e) => {
    if (resetModal.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); closeReset(); return; }
    // keep keyboard focus inside the dialog
    if (e.key === "Tab") {
      const items = Array.from(resetDialog.querySelectorAll("button"));
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) { e.preventDefault(); lastItem.focus(); }
      else if (!e.shiftKey && document.activeElement === lastItem) { e.preventDefault(); firstItem.focus(); }
      else if (!resetDialog.contains(document.activeElement)) { e.preventDefault(); firstItem.focus(); }
    }
  });

  // dedicated contact card: js/contact.js ("Contacter" → /messages, appointment slots)
})();
