/* =========================================================
   Givaudan Atelier — Mes commandes
   Orders come from js/orders.js (shared with Mes projets): samples +
   localStorage, merged by id. Protected page (session.js guard).
   ========================================================= */
(() => {
  "use strict";

  const S = window.AtelierSession;
  const session = S && S.get();
  if (!session) return; // session.js already redirected to the login page

  const Orders = window.AtelierOrders;
  const Store = window.AtelierStore;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const existing = Boolean(session.existingClient);
  const TODAY = Orders.TODAY;
  const $ = (id) => document.getElementById(id);

  /* ---------------- small DOM helper ---------------- */
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
  const typeLabel = (o) => (o.type === "reassort" ? "Réassort" : "Échantillon");
  const shortDate = (d) => Orders.frDate(d, { day: "numeric", month: "long" });
  const domId = (id) => `order-${String(id).replace(/[^\w-]/g, "_")}`;

  /* ---------------- toast ---------------- */
  const toast = $("toast");
  let toastTimer = 0;
  function showToast(text) {
    clearTimeout(toastTimer);
    toast.textContent = text;
    toast.classList.add("is-visible");
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
  }

  /* ---------------- accessible dialog (modal + drawer) ---------------- */
  function makeDialog(root, panel, closeSelector) {
    let opener = null;
    let timer = 0;
    const focusables = () => Array.from(panel.querySelectorAll(
      'a[href], button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), textarea:not([disabled])'
    )).filter((el) => el.offsetParent !== null);

    function open(from, focusEl) {
      clearTimeout(timer);
      opener = from || document.activeElement;
      root.hidden = false;
      document.body.classList.add("modal-open");
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("is-open")));
      (focusEl || panel).focus({ preventScroll: true });
    }
    function close() {
      if (root.hidden) return;
      root.classList.remove("is-open");
      document.body.classList.remove("modal-open");
      timer = setTimeout(() => { root.hidden = true; }, reduced ? 0 : 500);
      if (opener && document.contains(opener) && opener.offsetParent !== null) opener.focus({ preventScroll: true });
    }
    root.querySelectorAll(closeSelector).forEach((el) => el.addEventListener("click", close));
    document.addEventListener("keydown", (e) => {
      if (root.hidden) return;
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    });
    return { open, close, isOpen: () => !root.hidden };
  }

  /* ================= data + filters ================= */
  const filters = { type: "all", status: "all" };
  let openId = null;            // expanded detail (one at a time)
  const trackingOpen = new Set();
  let firstRender = true;

  const allOrders = () => Orders.list({ includeSamples: existing }); // new client: no sample orders

  function matches(o) {
    if (filters.type !== "all" && o.type !== filters.type) return false;
    if (filters.status === "open" && o.status === "livree") return false;
    if (filters.status === "delivered" && o.status !== "livree") return false;
    return true;
  }

  function setChips(group, value) {
    document.querySelectorAll(`[data-${group}]`).forEach((c) => {
      const on = c.dataset[group] === value;
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-pressed", String(on));
    });
  }
  document.querySelectorAll("[data-type]").forEach((c) => c.addEventListener("click", () => {
    filters.type = c.dataset.type; setChips("type", filters.type); render();
  }));
  document.querySelectorAll("[data-status]").forEach((c) => c.addEventListener("click", () => {
    filters.status = c.dataset.status; setChips("status", filters.status); render();
  }));
  function resetFilters() {
    filters.type = "all"; filters.status = "all";
    setChips("type", "all"); setChips("status", "all");
  }
  $("filters-reset").addEventListener("click", () => { resetFilters(); render(); $("order-list").querySelector("button")?.focus(); });

  /* ================= order card ================= */
  function timeline(o) {
    // a retouch request starts with "En étude" (5 steps), other orders keep 4
    const study = Boolean(o.retouche) || o.status === "etude";
    const statuses = study ? ["etude", ...Orders.STATUSES] : Orders.STATUSES;
    const labels = study ? ["En étude", ...Orders.STEP_LABELS] : Orders.STEP_LABELS;
    const step = statuses.indexOf(o.status);
    const delivered = o.status === "livree";
    const ol = h("ol", { class: `track${study ? " track--5" : ""}`, "aria-label": `Suivi : ${labels[step]} (étape ${step + 1} sur ${labels.length})` });
    labels.forEach((label, i) => {
      const state = i < step || (delivered && i === step) ? "done" : i === step ? "current" : "todo";
      ol.append(h("li", { class: `track-step is-${state}` },
        h("span", { class: "track-dot", "aria-hidden": "true" }),
        h("span", { class: "track-label" }, label),
        h("span", { class: "sr-only" }, state === "done" ? " — terminée" : state === "current" ? " — étape en cours" : " — à venir")));
    });
    return ol;
  }

  function trackingBlock(o, id) {
    const c = o.carrier || { name: "Transporteur", trackingNumber: "—", events: [] };
    const events = c.events.length ? c.events : [{ date: o.history[o.history.length - 1].date, label: "Colis remis au transporteur", place: "" }];
    return h("div", { class: "ocard-panel ocard-tracking", id, hidden: true },
      h("div", { class: "tracking-head" },
        h("p", {}, h("span", { class: "tk-label" }, "Transporteur"), h("span", { class: "tk-value" }, c.name)),
        h("p", {}, h("span", { class: "tk-label" }, "N° de suivi"), h("span", { class: "tk-value tk-mono" }, c.trackingNumber))),
      h("ol", { class: "tk-events", "aria-label": "Derniers événements" },
        events.map((ev, i) => h("li", { class: i === 0 ? "is-latest" : null },
          h("span", { class: "tk-when" }, `${shortDate(ev.date)}${ev.time ? ` · ${ev.time}` : ""}`),
          h("span", { class: "tk-what" }, ev.label, ev.place ? h("span", { class: "tk-place" }, ` — ${ev.place}`) : null)))));
  }

  function detailBlock(o, id) {
    const projectExists = o.projectId && Store && Store.find(o.projectId);
    const projectHref = projectExists ? `brief?projet=${encodeURIComponent(o.projectId)}` : "mes-projets";
    const a = o.address;
    return h("div", { class: "ocard-panel ocard-detail", id, hidden: true },
      h("div", { class: "detail-col" },
        h("h4", { class: "detail-title" }, "Historique"),
        h("ol", { class: "history" }, historyWithFeedback(o).reverse().map((ev) => h("li", {},
          h("span", { class: "history-date" }, Orders.frDate(ev.date)),
          h("span", { class: "history-label" }, ev.label))))),
      h("div", { class: "detail-col" },
        h("h4", { class: "detail-title" }, "Adresse de livraison"),
        h("address", { class: "detail-address" }, a.company, h("br"), a.line, h("br"), a.city, h("br"), a.country),
        o.comment ? h("p", { class: "detail-comment" }, `« ${o.comment} »`) : null,
        h("h4", { class: "detail-title" }, "Projet associé"),
        o.projectName
          ? h("p", { class: "detail-project" }, h("span", {}, o.projectName),
            h("a", { href: projectHref, class: "side-link" }, "Voir le projet ", h("span", { "aria-hidden": "true" }, "→")))
          : h("p", { class: "detail-project detail-muted" }, "Aucun projet associé")));
  }

  // the dated history, plus "Avis donné : …" once the sample feedback is given
  function historyWithFeedback(o) {
    const events = o.history.slice();
    if (o.feedback) events.push({ date: o.feedback.date, label: `Avis donné : ${Orders.feedbackLabel(o.feedback)}` });
    return events;
  }

  // quiet: rebuilt in place after a feedback step (no entrance animation)
  function card(o, index, highlightId, quiet = false) {
    const cid = domId(o.id);
    const delivered = o.status === "livree";
    const detailId = `${cid}-detail`;
    const trackId = `${cid}-tracking`;
    const li = h("li", {
      class: `ocard${quiet ? "" : firstRender ? " rise" : " ocard--in"}${o.id === highlightId ? " is-new" : ""}`,
      id: cid, "data-id": o.id, style: firstRender ? `--d: ${0.12 + index * 0.08}s` : null,
    });

    const toggle = h("button", { type: "button", class: "ocard-toggle", "aria-expanded": "false", "aria-controls": detailId },
      "Voir le détail", h("span", { class: "sr-only" }, ` de la commande ${o.number}`),
      h("span", { class: "ocard-chevron", "aria-hidden": "true" }));
    toggle.querySelector(".ocard-chevron").innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" focusable="false"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    li.append(
      h("div", { class: "ocard-head" },
        h("div", { class: "ocard-main" },
          h("div", { class: "ocard-tags" },
            h("span", { class: `badge badge--${o.type}` }, typeLabel(o)),
            h("span", { class: "ocard-cat" }, `${o.category} · ${o.quantity}`)),
          h("h3", { class: "ocard-ref" }, o.reference),
          h("p", { class: "ocard-meta" }, `Commande N° ${o.number}`, h("span", { "aria-hidden": "true" }, " · "), h("br", { class: "ocard-br" }), `Passée le ${Orders.frDate(o.orderedAt)}`)),
        toggle),
      timeline(o),
      h("p", { class: "ocard-eta" }, delivered ? `Livrée le ${Orders.frDate(o.deliveredAt)}`
        : o.status === "etude" ? "Échantillon retouché sous 5 jours ouvrés"
        : `Livraison prévue le ${Orders.frDate(o.expectedAt)}`));

    // delivered sample: "Votre échantillon … vous convient-il ?" (réassorts never)
    if (delivered && o.type === "echantillon") li.append(feedbackBlock(o, quiet));

    // actions depending on the status
    const actions = h("div", { class: "ocard-actions" });
    if (o.status === "expediee") {
      const track = h("button", { type: "button", class: "btn btn-outline btn-small", "aria-expanded": "false", "aria-controls": trackId }, "Suivre le colis");
      track.addEventListener("click", () => setTracking(li, o.id, !trackingOpen.has(o.id)));
      actions.append(track);
    }
    actions.append(h("button", { type: "button", class: "btn btn-outline btn-small", "aria-haspopup": "dialog", onclick: (e) => openDocs(o, e.currentTarget) },
      "Documents", h("span", { class: "sr-only" }, ` de la commande ${o.number}`)));
    // a sample: "Commander en volume" only once it "convient" (the feedback panel
    // offers it first, so it comes back here after the follow-up is chosen)
    const volumeReady = o.type === "reassort" || (o.feedback && o.feedback.verdict === "fits" && o.feedback.next);
    if (delivered && volumeReady) {
      const label = o.type === "reassort" ? "Recommander" : "Commander en volume";
      actions.append(h("button", { type: "button", class: "btn btn-primary btn-small", "aria-haspopup": "dialog", onclick: (e) => openReorder(o, e.currentTarget) },
        label, h("span", { class: "sr-only" }, ` ${o.reference}`)));
    }
    li.append(actions);
    if (o.status === "expediee") li.append(trackingBlock(o, trackId));
    li.append(detailBlock(o, detailId));

    toggle.addEventListener("click", () => setDetail(o.id, openId !== o.id));
    // a click anywhere on the card (outside its controls) toggles the detail
    li.addEventListener("click", (e) => {
      if (e.target.closest("button, a, input, select, textarea, .ocard-panel, .fb")) return;
      if (window.getSelection && String(window.getSelection())) return; // selecting text
      setDetail(o.id, openId !== o.id);
    });
    return li;
  }

  function setTracking(li, id, open) {
    const btn = li.querySelector(".ocard-actions [aria-controls$='-tracking']");
    const panel = li.querySelector(".ocard-tracking");
    if (!btn || !panel) return;
    if (open) trackingOpen.add(id); else trackingOpen.delete(id);
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "Masquer le suivi" : "Suivre le colis";
    panel.hidden = !open;
  }

  function setDetail(id, open) {
    openId = open ? id : null;
    document.querySelectorAll(".ocard").forEach((li) => {
      const on = li.dataset.id === openId;
      li.classList.toggle("is-open", on);
      li.querySelector(".ocard-toggle").setAttribute("aria-expanded", String(on));
      li.querySelector(".ocard-toggle").firstChild.textContent = on ? "Masquer le détail" : "Voir le détail";
      li.querySelector(".ocard-detail").hidden = !on;
    });
  }

  /* ================= sample feedback =================
     ask (3 choices) → details (À ajuster / Ne convient pas) → saved → follow-up
     (volume, devis, échantillon ajusté, expert, nouveaux assemblages) */
  const fbLive = h("p", { class: "sr-only", "aria-live": "polite" });
  document.querySelector("main").append(fbLive);
  function say(text) {
    fbLive.textContent = "";
    setTimeout(() => { fbLive.textContent = text; }, 60);
  }
  const fbUi = new Map(); // order id → { mode: "ask" | "details" | "quote", verdict, picks, note, volume, comment }
  const VERDICTS = [["fits", "Il convient"], ["adjust", "À ajuster"], ["no", "Ne convient pas"]];
  const ADJUST = ["Plus intense", "Plus léger", "Plus frais", "Plus doux", "Mettre une note en avant", "Autre"];
  // what each choice means (legend under the three buttons)
  const VERDICT_HELP = {
    fits: "Prêt pour la production.",
    adjust: "Nous gardons le même assemblage et nos parfumeurs le retouchent.",
    no: "Nous vous proposons une autre direction.",
  };
  const NOTE_STATES = ["", "à renforcer", "à atténuer"];
  const INTENSITY = ["Plus intense", "Plus léger"];

  // recommended dosage — also printed on the Fiche technique (single source)
  function dosageFor(category) {
    return category === "Bougie" ? "6 à 10 %" : "0,5 à 1,5 %";
  }
  const dosageMessage = (o) => `Bon à savoir : l'intensité dépend aussi du dosage du parfum dans votre produit. Vous pouvez d'abord l'ajuster vous-même (dosage conseillé : ${dosageFor(o.category)}).`;
  const MSG_DOSAGE = "Très bien. Si le résultat ne vous convient pas, vous pourrez demander une retouche ici.";

  // the blend of a sample (an adjusted version keeps the same blend)
  const baseName = (o) => o.reference.replace(/\s+—\s+version ajustée$/, "");
  // the order's project blends first (RAG bank), then the other projects, then the scenario catalog
  function blendOf(o) {
    const project = o.projectId ? Store.find(o.projectId) : null;
    return Store.findBlend(baseName(o), project);
  }
  const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // [["Tête", ["Mandarine"]], ["Cœur", ["Labdanum", "Benjoin"]], ["Fond", […]]]
  const pyramidOf = (blend) => [["top", "Tête"], ["heart", "Cœur"], ["base", "Fond"]]
    .map(([k, label]) => [label, String(blend[k] || "").split(",").map((n) => capital(n.trim())).filter(Boolean)]);

  // everything the perfumers need, from the answers of the retouch steps
  function retouchData(o, ui) {
    const fb = o.feedback || {};
    const adjustments = (ui.picks && ui.picks.length ? ui.picks : fb.adjust || []).slice();
    const pick = (state) => [...new Set(Object.entries(ui.noteStates || {}).filter(([, s]) => s === state).map(([key]) => key.split("|")[1]))];
    const note = [(ui.precision || "").trim(), (ui.note || fb.note || "").trim()].filter(Boolean).join(" — ");
    return {
      adjustments,
      adjustText: adjustments.map((a, i) => (i ? a.toLowerCase() : a)).join(", "),
      emphasize: pick(1),
      soften: pick(2),
      note,
    };
  }
  const REASONS = ["Trop fort", "Trop léger", "Pas la bonne direction", "Ne tient pas assez", "Autre"];
  const VOLUMES = ["Moins d'1 t", "1 à 10 t", "Plus de 10 t"];
  const needsFeedback = (o) => o.type === "echantillon" && o.status === "livree" && !o.feedback;
  const MSG_FITS = "Parfait ! Votre assemblage est prêt pour la production.";

  const chip = (label, pressed, onclick) =>
    h("button", { type: "button", class: "chip fb-chip", "aria-pressed": String(pressed), onclick }, label);

  function feedbackBlock(o, reveal) {
    const ui = fbUi.get(o.id);
    const fb = o.feedback;
    const wrap = h("div", { class: `fb${reveal && !reduced ? " fb--in" : ""}`, "data-fb": o.id });
    const ref = () => h("em", {}, o.reference);
    const fid = domId(o.id);

    /* 1 · the three choices */
    if ((!fb && !ui) || (ui && ui.mode === "ask")) {
      wrap.append(
        h("p", { class: "fb-question" }, "Votre échantillon ", ref(), " vous convient-il ?"),
        h("p", { class: "fb-sub" }, "Votre avis nous aide à préparer la suite."),
        h("div", { class: "fb-chips", role: "group", "aria-label": "Votre avis sur l'échantillon" },
          VERDICTS.map(([v, label]) => {
            const b = chip(label, false, () => chooseVerdict(o, v));
            b.setAttribute("aria-describedby", `fb-help-${v}-${fid}`);
            return b;
          })),
        h("ul", { class: "fb-legend" }, VERDICTS.map(([v, label]) =>
          h("li", { id: `fb-help-${v}-${fid}` }, h("span", { class: "fb-legend-term" }, label), " — ", VERDICT_HELP[v]))));
      if (fb) {
        wrap.append(h("button", { type: "button", class: "link-btn fb-cancel", onclick: () => { fbUi.delete(o.id); refreshCard(o.id, ".fb-edit"); } }, "Annuler"));
      }
      return wrap;
    }

    /* 2 · details (À ajuster / Ne convient pas) — nothing saved yet */
    if (ui && ui.mode === "details") {
      const isAdjust = ui.verdict === "adjust";
      const question = isAdjust ? "Que souhaitez-vous ajuster ?" : "Qu'est-ce qui ne vous a pas plu ?";
      const validate = h("button", { type: "button", class: "btn btn-primary btn-small", disabled: !ui.picks.length, onclick: () => saveDetails(o) }, "Valider");
      const group = h("div", { class: "fb-chips", role: "group", "aria-label": question });
      (isAdjust ? ADJUST : REASONS).forEach((label) => {
        const b = chip(label, ui.picks.includes(label), () => {
          const i = ui.picks.indexOf(label);
          if (i > -1) ui.picks.splice(i, 1); else ui.picks.push(label);
          b.setAttribute("aria-pressed", String(i === -1));
          validate.disabled = !ui.picks.length;
        });
        group.append(b);
      });
      const note = h("input", { class: "fb-input", id: `fb-note-${fid}`, type: "text", placeholder: "Précisez si vous le souhaitez", value: ui.note || "" });
      note.addEventListener("input", () => { ui.note = note.value; });
      wrap.append(
        h("p", { class: "fb-question" }, question),
        h("p", { class: "fb-sub" }, "Plusieurs choix possibles."),
        group,
        h("label", { class: "sr-only", for: `fb-note-${fid}` }, "Précisez si vous le souhaitez"),
        note,
        h("div", { class: "fb-actions" }, validate,
          h("button", { type: "button", class: "link-btn fb-cancel", onclick: () => { fbUi.set(o.id, { mode: "ask" }); refreshCard(o.id, ".fb-chip"); say("Votre échantillon vous convient-il ?"); } }, "Annuler")));
      return wrap;
    }

    /* "Demander un devis" (Il convient) */
    if (ui && ui.mode === "quote") {
      const send = h("button", { type: "button", class: "btn btn-primary btn-small", disabled: !ui.volume, onclick: () => sendQuote(o) }, "Envoyer la demande");
      const group = h("div", { class: "fb-chips", role: "group", "aria-labelledby": `fb-vol-${fid}` });
      VOLUMES.forEach((label) => {
        group.append(chip(label, ui.volume === label, (e) => {
          ui.volume = label;
          group.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
          send.disabled = false;
        }));
      });
      const comment = h("textarea", { class: "fb-input fb-textarea", id: `fb-quote-${fid}`, rows: "2", placeholder: "Ex. : lancement prévu au printemps, conditionnement en fûts" });
      comment.value = ui.comment || "";
      comment.addEventListener("input", () => { ui.comment = comment.value; });
      wrap.append(
        h("p", { class: "fb-question" }, "Demander un devis"),
        h("p", { class: "fb-label", id: `fb-vol-${fid}` }, "Volume annuel"),
        group,
        h("label", { class: "fb-label", for: `fb-quote-${fid}` }, "Commentaire (facultatif)"),
        comment,
        h("div", { class: "fb-actions" }, send,
          h("button", { type: "button", class: "link-btn fb-cancel", onclick: () => { fbUi.delete(o.id); refreshCard(o.id, ".fb-actions .btn"); } }, "Annuler")));
      return wrap;
    }

    const expertLink = () => h("button", { type: "button", class: "link-btn fb-expert", onclick: () => toExpert(o) }, "Je préfère échanger avec un expert");

    /* À ajuster · intensity: try the dosage first */
    if (ui && ui.mode === "dosage") {
      wrap.append(
        h("p", { class: "fb-message fb-advice" }, dosageMessage(o)),
        h("div", { class: "fb-actions" },
          h("button", { type: "button", class: "btn btn-outline btn-small", onclick: () => tryDosage(o) }, "J'essaie d'abord"),
          h("button", { type: "button", class: "btn btn-primary btn-small", onclick: () => goNotes(o, ui) }, "Je préfère une retouche")),
        expertLink());
      return wrap;
    }

    /* À ajuster · which notes to bring out or soften */
    if (ui && ui.mode === "notes") {
      const blend = blendOf(o);
      wrap.append(h("p", { class: "fb-question" }, blend ? "Souhaitez-vous mettre une note en avant ?" : "Une précision pour nos parfumeurs ?"));
      if (blend) {
        wrap.append(h("p", { class: "fb-sub" }, "Un clic : à renforcer · deux clics : à atténuer"));
        const grid = h("dl", { class: "fb-pyramid" });
        pyramidOf(blend).forEach(([tier, notes]) => {
          if (!notes.length) return;
          grid.append(h("div", { class: "fb-tier" },
            h("dt", {}, tier),
            h("dd", {}, h("div", { class: "fb-chips fb-notes", role: "group", "aria-label": `Notes de ${tier.toLowerCase()}` },
              notes.map((n) => noteChip(ui, tier, n))))));
        });
        wrap.append(grid);
      }
      const pid = `fb-prec-${fid}`;
      const precision = h("textarea", { class: "fb-input fb-textarea", id: pid, rows: "2", placeholder: "Ex. : je voudrais que l'orange ressorte plus que la vanille." });
      precision.value = ui.precision || "";
      precision.addEventListener("input", () => { ui.precision = precision.value; });
      wrap.append(
        h("label", { class: blend ? "fb-label" : "sr-only", for: pid }, "Une précision pour nos parfumeurs ?"),
        precision,
        h("div", { class: "fb-actions" },
          h("button", { type: "button", class: "btn btn-primary btn-small", onclick: () => { ui.mode = "recap"; refreshCard(o.id, ".fb-actions .btn-primary"); say("Votre demande de retouche : vérifiez puis confirmez."); } }, "Continuer"),
          h("button", { type: "button", class: "link-btn fb-cancel", onclick: () => { fbUi.delete(o.id); refreshCard(o.id, ".fb-actions .btn"); } }, "Annuler")),
        expertLink());
      return wrap;
    }

    /* À ajuster · recap before anything is created */
    if (ui && ui.mode === "recap") {
      const r = retouchData(o, ui);
      const a = o.address;
      const row = (label, value) => h("div", { class: "fb-recap-row" }, h("dt", {}, label), h("dd", {}, value || "—"));
      wrap.append(
        h("div", { class: "fb-recap", role: "group", "aria-labelledby": `fb-recap-${fid}` },
          h("p", { class: "fb-eyebrow", id: `fb-recap-${fid}` }, "Votre demande de retouche"),
          h("dl", {},
            row("Assemblage", baseName(o)),
            row("Ajustements", r.adjustText),
            row("Notes à renforcer", r.emphasize.join(", ")),
            row("Notes à atténuer", r.soften.join(", ")),
            row("Précision", r.note),
            row("Livraison", `${a.company}, ${a.line}, ${a.city}`)),
          h("p", { class: "fb-sub fb-recap-line" }, "Nos parfumeurs étudient votre demande et vous envoient un échantillon retouché sous 5 jours ouvrés.")),
        h("div", { class: "fb-actions" },
          h("button", { type: "button", class: "btn btn-primary btn-small", onclick: () => confirmRetouche(o) }, "Confirmer la demande"),
          h("button", { type: "button", class: "btn btn-outline btn-small", onclick: () => { ui.mode = "details"; refreshCard(o.id, ".fb-chip"); say("Que souhaitez-vous ajuster ?"); } }, "Modifier"),
          h("button", { type: "button", class: "link-btn fb-cancel", onclick: () => { fbUi.delete(o.id); refreshCard(o.id, ".fb-actions .btn"); } }, "Annuler")));
      return wrap;
    }

    /* 3 · saved: compact summary (+ the follow-up choice while none is chosen) */
    wrap.classList.add("fb--done");
    wrap.append(h("div", { class: "fb-summary" },
      h("span", { class: `fb-badge fb-badge--${fb.verdict}` }, `Votre avis : ${Orders.feedbackLabel(fb)}`),
      h("span", { class: "fb-date" }, `le ${Orders.frDate(fb.date)}`),
      fb.next ? h("span", { class: "fb-next" }, fb.next === "adjusted_sample" && fb.dosageTested
        ? `Vous avez testé le dosage, puis demandé une retouche${fb.adjustedOrder ? ` : N° ${fb.adjustedOrder}` : ""}`
        : Orders.feedbackNextLabel(fb, existing)) : null,
      h("button", { type: "button", class: "link-btn fb-edit", onclick: () => { fbUi.set(o.id, { mode: "ask" }); refreshCard(o.id, ".fb-chip"); } }, "Modifier mon avis")));
    // the client tests the dosage first: a retouch can still be requested here
    if (fb.verdict === "adjust" && fb.next === "dosage") {
      wrap.append(h("p", { class: "fb-message" }, MSG_DOSAGE),
        h("button", { type: "button", class: "link-btn fb-retouch", onclick: () => startRetouch(o, true) }, "Demander une retouche"));
      return wrap;
    }
    if (fb.next) return wrap;

    const expertBtn = () => h("button", { type: "button", class: "btn btn-outline btn-small", onclick: () => toExpert(o) }, "Échanger avec un expert");
    if (fb.verdict === "fits") {
      wrap.append(h("p", { class: "fb-message" }, MSG_FITS),
        h("div", { class: "fb-actions" },
          h("button", { type: "button", class: "btn btn-primary btn-small", "aria-haspopup": "dialog", onclick: (e) => openReorder(o, e.currentTarget) }, "Commander en volume"),
          h("button", { type: "button", class: "btn btn-outline btn-small", onclick: () => { fbUi.set(o.id, { mode: "quote", volume: null, comment: "" }); refreshCard(o.id, ".fb-chip"); say("Demander un devis. Volume annuel ?"); } }, "Demander un devis")));
    } else if (fb.verdict === "adjust") {
      wrap.append(h("div", { class: "fb-actions" },
        h("button", { type: "button", class: "btn btn-primary btn-small", onclick: () => startRetouch(o) }, "Demander une retouche"),
        expertBtn()));
    } else {
      wrap.append(h("p", { class: "fb-message" }, "C'est noté : nous ne vous proposerons plus ", ref(), "."),
        h("div", { class: "fb-actions" },
          h("button", { type: "button", class: "btn btn-primary btn-small", onclick: () => newBlends(o) }, "Découvrir de nouveaux assemblages"),
          expertBtn()));
    }
    return wrap;
  }

  function chooseVerdict(o, verdict) {
    if (verdict === "fits") {
      Orders.update(o.id, { feedback: { verdict: "fits", date: TODAY, next: null } });
      feedbackEvent(o, { verdict: "fits" });
      fbUi.delete(o.id);
      refreshCard(o.id, ".fb-actions .btn");
      say(MSG_FITS);
      return;
    }
    fbUi.set(o.id, { mode: "details", verdict, picks: [], note: "" });
    refreshCard(o.id, ".fb-chip");
    say(verdict === "adjust" ? "Que souhaitez-vous ajuster ?" : "Qu'est-ce qui ne vous a pas plu ?");
  }

  function saveDetails(o) {
    const ui = fbUi.get(o.id);
    if (!ui || !ui.picks.length) return;
    const fb = { verdict: ui.verdict, date: TODAY, note: (ui.note || "").trim(), next: null };
    fb[ui.verdict === "adjust" ? "adjust" : "reason"] = ui.picks.slice();
    if (ui.verdict === "no") Store.rejectBlend(o.reference); // never proposed again
    if (ui.verdict === "adjust") {
      // same blend, retouched: dosage advice first for an intensity change, then the notes
      const prev = o.feedback || {};
      fb.dosageTested = Boolean(prev.dosageTested || prev.next === "dosage");
      Orders.update(o.id, { feedback: fb });
      feedbackEvent(o, fb);
      const intensity = ui.picks.some((p) => INTENSITY.includes(p));
      ui.noteStates = ui.noteStates || {};
      ui.mode = intensity && !ui.dosageDone && !fb.dosageTested ? "dosage" : "notes";
      fbUi.set(o.id, ui);
      refreshCard(o.id, ui.mode === "dosage" ? ".fb-actions .btn" : ".fb-note, .fb-textarea");
      say(ui.mode === "dosage" ? dosageMessage(o) : "Souhaitez-vous mettre une note en avant ?");
      return;
    }
    Orders.update(o.id, { feedback: fb });
    feedbackEvent(o, fb);
    fbUi.delete(o.id);
    refreshCard(o.id, ".fb-actions .btn");
    say(ui.verdict === "no" ? `C'est noté : nous ne vous proposerons plus ${o.reference}.` : `Avis enregistré : ${Orders.feedbackLabel(fb)}.`);
  }

  /* conversation with the sales rep (js/messages-store.js): automatic system events */
  const M = window.AtelierMessages;
  const aboutOrder = (o) => ({ type: "order", id: o.id, label: `${o.reference} — N° ${o.number}` });
  function feedbackEvent(o, fb) {
    if (!M) return;
    M.addSystem(`Votre avis sur ${baseName(o)} : ${Orders.feedbackLabel(fb)}.`, aboutOrder(o), `feedback:${o.id}:${fb.verdict}`);
  }

  function setNext(o, next, extra = {}) {
    return Orders.update(o.id, { feedback: { ...o.feedback, next, ...extra } });
  }

  function sendQuote(o) {
    const ui = fbUi.get(o.id);
    if (!ui || !ui.volume) return;
    setNext(o, "quote", { quote: { volume: ui.volume, comment: (ui.comment || "").trim() } });
    if (M) M.addSystem(`Demande de devis transmise à ${existing ? "Claire Martin" : "notre équipe"}.`, aboutOrder(o), `quote:${o.id}`);
    fbUi.delete(o.id);
    refreshCard(o.id, ".fb-edit");
    showToast(existing ? "Demande de devis transmise à Claire Martin." : "Demande de devis transmise à nos experts.");
  }

  function toExpert(o) {
    fbUi.delete(o.id);
    setNext(o, "expert");
    refreshCard(o.id, ".fb-edit");
    showToast(existing
      ? "Votre demande a été transmise à Claire Martin. Elle vous recontacte sous 48 h."
      : "Votre demande a été transmise à l'un de nos experts. Il vous recontacte sous 48 h.");
  }

  /* ---------- À ajuster: retouch request ---------- */
  // a chip cycling neutral → à renforcer → à atténuer
  function noteChip(ui, tier, name) {
    const key = `${tier}|${name}`;
    const b = h("button", { type: "button", class: "chip fb-note" });
    const paint = () => {
      const s = ui.noteStates[key] || 0;
      b.dataset.state = String(s);
      b.textContent = "";
      b.append(h("span", { class: "fb-note-icon", "aria-hidden": "true" }, s === 1 ? "↑" : s === 2 ? "↓" : ""), name);
      b.setAttribute("aria-label", s ? `${name}, ${NOTE_STATES[s]}` : name);
    };
    b.addEventListener("click", () => {
      ui.noteStates[key] = ((ui.noteStates[key] || 0) + 1) % 3;
      paint();
      say(`${name} : ${NOTE_STATES[ui.noteStates[key]] || "neutre"}`);
    });
    paint();
    return b;
  }

  function goNotes(o, ui) {
    ui.mode = "notes";
    refreshCard(o.id, ".fb-note, .fb-textarea");
    say("Souhaitez-vous mettre une note en avant ?");
  }

  // "Demander une retouche" from the saved summary (keeps earlier answers)
  function startRetouch(o, dosageDone = false) {
    const fb = o.feedback || {};
    const prev = fbUi.get(o.id) || {};
    const ui = {
      verdict: "adjust", picks: (fb.adjust || []).slice(), note: fb.note || "",
      noteStates: prev.noteStates || {}, precision: prev.precision || "", dosageDone: dosageDone || prev.dosageDone,
    };
    fbUi.set(o.id, ui);
    goNotes(o, ui);
  }

  function tryDosage(o) {
    setNext(o, "dosage", { dosageTested: true });
    fbUi.delete(o.id);
    refreshCard(o.id, ".fb-retouch");
    say(MSG_DOSAGE);
  }

  // nothing is created before "Confirmer la demande": an adjusted sample "En étude"
  function confirmRetouche(o) {
    const ui = fbUi.get(o.id);
    if (!ui) return;
    const r = retouchData(o, ui);
    const retouche = { adjustments: r.adjustments, emphasize: r.emphasize, soften: r.soften, note: r.note, requestedAt: TODAY };
    const parts = [];
    if (r.emphasize.length) parts.push(`à renforcer : ${r.emphasize.join(", ")}`);
    if (r.soften.length) parts.push(`à atténuer : ${r.soften.join(", ")}`);
    r.adjustments.filter((a) => !["Mettre une note en avant", "Autre"].includes(a)).forEach((a) => parts.push(a.toLowerCase()));
    const created = Orders.add({
      type: "echantillon",
      reference: `${baseName(o)} — version ajustée`,
      category: o.category,
      quantity: "50 ml",
      orderedAt: TODAY,
      expectedAt: Orders.addDays(TODAY, 7),
      deliveredAt: null,
      status: "etude",
      history: [{ date: TODAY, label: `Demande de retouche — ${parts.join(" · ") || "précisions transmises à nos parfumeurs"}` }],
      address: { ...o.address },
      projectId: o.projectId,
      projectName: o.projectName,
      carrier: null,
      retouche, // read later by the Espace commercial
    });
    setNext(o, "adjusted_sample", { adjustedOrder: created.number, retouche });
    if (M) M.addSystem(`Demande de retouche envoyée à nos parfumeurs — N° ${created.number}`, aboutOrder(created), `retouch:${created.number}`);
    fbUi.delete(o.id);
    resetFilters();
    render({ highlightId: created.id });
    showToast(`Demande de retouche envoyée à nos parfumeurs : N° ${created.number}.`);
    const li = document.querySelector(`.ocard[data-id="${CSS.escape(created.id)}"]`);
    if (li) {
      li.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      li.querySelector(".ocard-toggle").focus({ preventScroll: true });
    }
  }

  function newBlends(o) {
    setNext(o, "new_blends");
    // resume the project (its blends no longer include the rejected one)
    const exists = o.projectId && Store && Store.find(o.projectId);
    location.href = exists ? `creer-projet?projet=${encodeURIComponent(o.projectId)}` : "creer-projet";
  }

  // rebuild one card in place after a feedback step (keeps the open panels)
  function refreshCard(id, focusSel) {
    const o = allOrders().find((x) => x.id === id);
    const old = document.querySelector(`.ocard[data-id="${CSS.escape(id)}"]`);
    if (!o || !old) { render(); return; }
    const fresh = card(o, 0, null, true);
    old.replaceWith(fresh);
    if (openId === id) setDetail(id, true);
    if (trackingOpen.has(id)) setTracking(fresh, id, true);
    renderNotices(allOrders());
    const target = focusSel && fresh.querySelector(focusSel);
    if (target) target.focus({ preventScroll: true });
  }

  function renderFeedbackNotice(list) {
    const notice = $("fb-notice");
    const pending = list.filter(needsFeedback).sort((a, b) => (b.deliveredAt || "").localeCompare(a.deliveredAt || ""))[0];
    if (!pending) { notice.hidden = true; return; }
    const text = $("fb-notice-text");
    text.textContent = "";
    text.append("Votre avis compte : l'échantillon ", h("em", {}, pending.reference), " vous convient-il ?");
    const link = $("fb-notice-link");
    link.href = `#${encodeURIComponent(pending.id)}`;
    link.onclick = (e) => {
      e.preventDefault();
      if (!focusOrder(pending.id)) return;
      const first = document.querySelector(`.ocard[data-id="${CSS.escape(pending.id)}"] .fb-chip`);
      if (first) first.focus({ preventScroll: true });
    };
    notice.hidden = false;
  }
  function renderNotices(list) {
    renderNotice(list);
    renderFeedbackNotice(list);
  }

  /* ================= notification + contact ================= */
  function renderNotice(list) {
    const notice = $("notice");
    const transit = list.filter((o) => o.status === "expediee").sort((a, b) => a.expectedAt.localeCompare(b.expectedAt))[0];
    if (!transit) { notice.hidden = true; return; }
    const diff = Orders.daysBetween(TODAY, transit.expectedAt);
    const when = diff === 0 ? "aujourd'hui" : diff === 1 ? "demain" : diff > 1 ? `le ${shortDate(transit.expectedAt)}` : "très prochainement";
    const text = $("notice-text");
    text.textContent = "";
    text.append(`Votre ${transit.type === "reassort" ? "réassort" : "échantillon"} `, h("em", {}, transit.reference), ` sera livré ${when}.`);
    const link = $("notice-link");
    link.href = `#${encodeURIComponent(transit.id)}`;
    link.onclick = (e) => { e.preventDefault(); focusOrder(transit.id, { tracking: true }); };
    notice.hidden = false;
  }

  if (!existing) {
    // a new client has no dedicated contact yet
    $("contact-person").hidden = true;
    $("contact-line").textContent = "Notre équipe vous répond sous 24 h, du lundi au vendredi.";
    $("contact-btn").textContent = "Nous contacter";
  }

  /* ================= render ================= */
  function render({ highlightId = null } = {}) {
    const list = allOrders();
    const empty = list.length === 0; // only possible for a new client
    $("orders-empty").hidden = !empty;
    $("orders-layout").hidden = empty;
    $("reorder-open").hidden = empty;
    if (empty) return;

    const shown = list.filter(matches);
    const ul = $("order-list");
    ul.textContent = "";
    shown.forEach((o, i) => ul.append(card(o, i, highlightId)));
    $("orders-none").hidden = shown.length > 0;
    const n = shown.length;
    $("orders-status").textContent = `${n} commande${n > 1 ? "s" : ""} affichée${n > 1 ? "s" : ""}`;

    // restore the open panels
    if (openId && shown.some((o) => o.id === openId)) setDetail(openId, true); else openId = null;
    trackingOpen.forEach((id) => { const li = ul.querySelector(`[data-id="${CSS.escape(id)}"]`); if (li) setTracking(li, id, true); });

    renderNotices(list);
    firstRender = false;
  }

  /* ================= scroll + highlight (deep links) ================= */
  function focusOrder(id, { tracking = false } = {}) {
    let li = document.querySelector(`.ocard[data-id="${CSS.escape(id)}"]`);
    if (!li) {
      // hidden by the filters: show everything first
      resetFilters(); render();
      li = document.querySelector(`.ocard[data-id="${CSS.escape(id)}"]`);
    }
    if (!li) return false;
    setDetail(id, true);
    if (tracking) setTracking(li, id, true);
    // the highlight animation would replace the entrance one and leave the card
    // in its starting state (transparent, 14 px lower): show it at rest first
    li.classList.remove("rise", "ocard--in");
    // the card starts below the fixed header, with 24 px of breathing room
    const header = document.querySelector(".site-header");
    const offset = (header ? header.getBoundingClientRect().height : 0) + 24;
    const lenis = window.atelierLenis;
    if (lenis && typeof lenis.scrollTo === "function") lenis.scrollTo(li, { offset: -offset, immediate: reduced });
    else {
      // layout position (offsetTop chain): not skewed by the cards' entrance slide
      let top = 0;
      for (let el = li; el; el = el.offsetParent) top += el.offsetTop;
      window.scrollTo({ top: Math.max(0, top - offset), behavior: reduced ? "auto" : "smooth" });
    }
    li.classList.remove("is-highlight");
    void li.offsetWidth;
    li.classList.add("is-highlight");
    setTimeout(() => li.classList.remove("is-highlight"), 2400);
    li.querySelector(".ocard-toggle").focus({ preventScroll: true });
    return true;
  }

  /* ================= documents drawer ================= */
  const docsRoot = $("docs-drawer");
  const docsPanel = docsRoot.querySelector(".drawer-panel");
  const docs = makeDialog(docsRoot, docsPanel, "[data-docs-close]");
  let docsOrder = null;

  const IFRA = {
    "Bain & douche": "Catégorie 9 — produits rincés",
    "Gel douche": "Catégorie 9 — produits rincés",
    "Bougie": "Catégorie 12 — produits sans contact cutané",
    "Soin du linge": "Catégorie 10A — produits d'entretien",
    "Lessive": "Catégorie 10A — produits d'entretien",
    "Soin du corps": "Catégorie 5A — produits corporels sans rinçage",
    "Crème mains": "Catégorie 5C — crèmes pour les mains",
    "Parfum fin": "Catégorie 4 — parfumerie fine",
    "Parfum d'ambiance": "Catégorie 10B — désodorisants d'intérieur",
  };
  const DOCS = [
    {
      key: "tech", title: "Fiche technique", sub: "Caractéristiques physico-chimiques",
      fields: (o) => [
        ["Aspect", "Liquide limpide"], ["Couleur", "Incolore à jaune pâle"],
        ["Densité à 20 °C", "0,962 ± 0,010"], ["Indice de réfraction à 20 °C", "1,478 ± 0,005"],
        ["Point éclair", "78 °C"], ["Dosage conseillé", dosageFor(o.category)],
        ["Conservation", "24 mois dans l'emballage d'origine, à l'abri de la lumière"],
      ],
    },
    {
      key: "fds", title: "Fiche de données de sécurité (FDS)", sub: "Règlement (CE) n° 1907/2006 — REACH",
      fields: (o) => [
        ["Identification", `${o.reference} — composition parfumante`], ["Usage", `Parfumage : ${o.category.toLowerCase()}`],
        ["Pictogramme", "SGH07 — point d'exclamation"], ["Mentions de danger", "H317 : peut provoquer une allergie cutanée. H412 : nocif pour les organismes aquatiques."],
        ["Premiers secours", "En cas de contact avec la peau : laver abondamment à l'eau et au savon."],
        ["Stockage", "Entre 15 et 25 °C, récipient fermé, à l'abri de la chaleur."],
      ],
    },
    {
      key: "ifra", title: "Certificat IFRA", sub: "Conformité aux standards IFRA — 51ᵉ amendement",
      fields: (o) => [
        ["Produit", o.reference], ["Application", o.category],
        ["Catégorie IFRA", IFRA[o.category] || "Catégorie 9 — produits rincés"],
        ["Concentration maximale autorisée", o.category === "Bougie" ? "12,0 %" : "2,5 %"],
        ["Conformité", "Conforme au 51ᵉ amendement IFRA"], ["Validité", "Jusqu'à la publication du prochain amendement"],
      ],
    },
  ];

  function openDocs(o, opener) {
    docsOrder = o;
    $("docs-title").textContent = "Documents";
    $("docs-sub").textContent = `${o.reference} · Commande N° ${o.number}`;
    const ul = $("docs-list");
    ul.textContent = "";
    DOCS.forEach((d) => ul.append(h("li", {},
      h("button", { type: "button", class: "doc-item", onclick: () => showDoc(d) },
        h("span", { class: "doc-icon", "aria-hidden": "true" }, "PDF"),
        h("span", { class: "doc-text" }, h("span", { class: "doc-name" }, d.title), h("span", { class: "doc-sub" }, d.sub)),
        h("span", { class: "doc-arrow", "aria-hidden": "true" }, "→")))));
    $("docs-list-view").hidden = false;
    $("docs-preview-view").hidden = true;
    docs.open(opener, ul.querySelector("button"));
  }

  function showDoc(d) {
    const o = docsOrder;
    const prev = $("docprev");
    prev.textContent = "";
    prev.append(
      h("header", { class: "docprev-head" },
        h("span", { class: "docprev-brand" }, "Givaudan Atelier"),
        h("span", { class: "docprev-demo" }, "Document de démonstration")),
      h("h3", { class: "docprev-title", id: "docprev-title" }, d.title),
      h("p", { class: "docprev-sub" }, d.sub),
      h("dl", { class: "docprev-meta" },
        h("div", {}, h("dt", {}, "Référence"), h("dd", {}, o.reference)),
        h("div", {}, h("dt", {}, "Commande"), h("dd", {}, `N° ${o.number}`)),
        h("div", {}, h("dt", {}, "Date d'édition"), h("dd", {}, Orders.frDate(TODAY)))),
      h("dl", { class: "docprev-fields" }, d.fields(o).map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, v)))),
      h("p", { class: "docprev-foot" }, "Document de démonstration — prototype hackathon HETIC × Givaudan 2026. Les valeurs sont fictives et ne constituent pas un document réglementaire."));
    $("docs-list-view").hidden = true;
    $("docs-preview-view").hidden = false;
    $("docs-back").focus({ preventScroll: true });
    docsPanel.scrollTop = 0;
  }
  $("docs-back").addEventListener("click", () => {
    $("docs-preview-view").hidden = true;
    $("docs-list-view").hidden = false;
    $("docs-list").querySelector("button").focus({ preventScroll: true });
  });
  // "Télécharger en PDF": print only the preview (see print CSS)
  $("docs-print").addEventListener("click", () => {
    const root = document.documentElement;
    root.classList.add("print-docprev");
    const clear = () => root.classList.remove("print-docprev");
    window.addEventListener("afterprint", clear, { once: true });
    window.print();
    setTimeout(clear, 1000);
  });

  /* ================= reorder modal ================= */
  const reRoot = $("reorder-modal");
  const reDialog = reRoot.querySelector(".modal-dialog");
  const reorder = makeDialog(reRoot, reDialog, "[data-reorder-close]");
  const f = {
    form: $("reorder-form"), fixed: $("rf-ref-fixed"), name: $("rf-ref-name"), sub: $("rf-ref-sub"), select: $("rf-ref-select"),
    qty: $("rf-qty"), minus: $("rf-minus"), plus: $("rf-plus"), qtyError: $("rf-qty-error"),
    date: $("rf-date"), dateError: $("rf-date-error"),
    company: $("rf-company"), addrText: $("rf-address-text"), addrInput: $("rf-address-input"), addrEdit: $("rf-address-edit"),
    comment: $("rf-comment"), summary: $("rf-summary"),
  };
  const MIN_QTY = 5;
  const minDate = Orders.addDays(TODAY, 7);
  let source = null;       // order the new réassort is based on
  let address = null;

  const kgOf = (o) => {
    const m = /([\d.,]+)\s*kg/i.exec(o.quantity || "");
    return m ? Math.max(MIN_QTY, Math.round(parseFloat(m[1].replace(",", ".")))) : null;
  };
  const defaultQty = (o) => (o.type === "reassort" && kgOf(o)) || 25;
  const references = () => {
    const seen = new Map();
    allOrders().forEach((o) => { if (!seen.has(o.reference)) seen.set(o.reference, o); }); // latest first
    return [...seen.values()];
  };

  function useSource(o) {
    source = o;
    address = { ...o.address };
    f.qty.value = defaultQty(o);
    f.company.textContent = address.company;
    f.addrText.textContent = `${address.line}, ${address.city}`;
    f.addrInput.value = `${address.line}, ${address.city}`;
    updateSummary();
  }

  function openReorder(o, opener) {
    const refs = references();
    if (!refs.length) return; // nothing ordered yet
    f.qtyError.textContent = ""; f.dateError.textContent = "";
    f.qty.removeAttribute("aria-invalid"); f.date.removeAttribute("aria-invalid");
    f.comment.value = "";
    setAddressEditing(false);
    f.date.min = minDate;
    f.date.value = Orders.addDays(TODAY, 14);
    if (o) {
      f.fixed.hidden = false; f.select.hidden = true;
      f.name.textContent = o.reference;
      f.sub.textContent = `D'après votre ${o.type === "reassort" ? "réassort" : "échantillon"} N° ${o.number} · ${o.category}`;
      useSource(o);
    } else {
      f.fixed.hidden = true; f.select.hidden = false;
      f.select.textContent = "";
      refs.forEach((r) => f.select.append(h("option", { value: r.id }, `${r.reference} — ${typeLabel(r).toLowerCase()} N° ${r.number}`)));
      useSource(refs[0]);
    }
    reorder.open(opener, o ? f.qty : f.select);
  }
  f.select.addEventListener("change", () => {
    const o = allOrders().find((x) => x.id === f.select.value);
    if (o) useSource(o);
  });

  const qtyValue = () => parseInt(f.qty.value, 10);
  f.minus.addEventListener("click", () => { f.qty.value = Math.max(MIN_QTY, (qtyValue() || MIN_QTY) - 5); updateSummary(); });
  f.plus.addEventListener("click", () => { f.qty.value = (qtyValue() || 0) + 5; updateSummary(); });
  [f.qty, f.date].forEach((el) => el.addEventListener("input", updateSummary));

  function setAddressEditing(on) {
    f.addrInput.hidden = !on;
    f.addrText.hidden = on;
    f.addrEdit.setAttribute("aria-expanded", String(on));
    f.addrEdit.textContent = on ? "OK" : "Modifier";
  }
  f.addrEdit.addEventListener("click", () => {
    const editing = f.addrEdit.getAttribute("aria-expanded") === "true";
    if (editing) commitAddress();
    setAddressEditing(!editing);
    if (!editing) f.addrInput.focus();
  });
  function commitAddress() {
    const [line, ...city] = f.addrInput.value.split(",").map((x) => x.trim());
    if (line) { address.line = line; if (city.length) address.city = city.join(", "); }
    f.addrText.textContent = `${address.line}, ${address.city}`;
  }

  function updateSummary() {
    const q = qtyValue();
    const d = Orders.parseDate(f.date.value);
    f.summary.textContent = `Réassort · ${source ? source.reference : "—"} · ${q >= MIN_QTY ? `${q} kg` : "—"} · livraison souhaitée le ${d ? Orders.frDate(f.date.value) : "—"}`;
  }

  f.form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (f.addrEdit.getAttribute("aria-expanded") === "true") { commitAddress(); setAddressEditing(false); }
    const q = qtyValue();
    let ok = true;
    if (!(q >= MIN_QTY)) {
      f.qtyError.textContent = `Indiquez une quantité d'au moins ${MIN_QTY} kg.`;
      f.qty.setAttribute("aria-invalid", "true");
      ok = false;
    } else { f.qtyError.textContent = ""; f.qty.removeAttribute("aria-invalid"); }
    if (!f.date.value || f.date.value < minDate) {
      f.dateError.textContent = `Choisissez une date à partir du ${Orders.frDate(minDate)}.`;
      f.date.setAttribute("aria-invalid", "true");
      ok = false;
    } else { f.dateError.textContent = ""; f.date.removeAttribute("aria-invalid"); }
    if (!ok) { (f.qty.getAttribute("aria-invalid") ? f.qty : f.date).focus(); return; }

    const created = Orders.add({
      type: "reassort",
      reference: source.reference,
      category: source.category,
      quantity: `${q} kg`,
      orderedAt: TODAY,
      expectedAt: f.date.value,
      deliveredAt: null,
      status: "confirmee",
      history: [{ date: TODAY, label: "Commande confirmée" }],
      address: { ...address },
      projectId: source.projectId,
      projectName: source.projectName,
      carrier: null,
      comment: f.comment.value.trim(),
    });
    // volume order of a sample that "convient": that is the follow-up of its feedback
    if (source.type === "echantillon" && source.feedback && source.feedback.verdict === "fits") {
      Orders.update(source.id, { feedback: { ...source.feedback, next: "volume", volumeOrder: created.number } });
    }
    reorder.close();
    resetFilters();
    render({ highlightId: created.id });
    showToast(`Commande N° ${created.number} confirmée.`);
    const li = document.querySelector(`.ocard[data-id="${CSS.escape(created.id)}"]`);
    if (li) li.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  });

  $("reorder-open").addEventListener("click", (e) => openReorder(null, e.currentTarget));

  /* ================= start + deep links ================= */
  render();

  function handleHash() {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (!hash) return;
    if (hash === "recommander") openReorder(null, $("reorder-open"));
    else if (hash.startsWith("recommander-")) {
      // commandes#recommander-<orderId>: prefilled like "Recommander" on its card
      // (unknown id → modal without preselection)
      const order = allOrders().find((o) => o.id === hash.slice("recommander-".length)) || null;
      openReorder(order, $("reorder-open"));
    } else if (/^avis-(.+)-(fits|adjust|no)$/.test(hash)) {
      // commandes#avis-<orderId>-fits|adjust|no (from Messages): open the order and
      // start that feedback path, as if its button had been clicked
      const [, id, verdict] = /^avis-(.+)-(fits|adjust|no)$/.exec(hash);
      const order = allOrders().find((o) => o.id === id);
      if (!order) return;
      const start = order.type === "echantillon" && order.status === "livree" && !order.feedback;
      if (start) {
        // the card must be on screen before the path starts (it rebuilds the card)
        if (!document.querySelector(`.ocard[data-id="${CSS.escape(id)}"]`)) { resetFilters(); render(); }
        chooseVerdict(order, verdict);
      }
      if (!focusOrder(id)) return;
      if (start) {
        const first = document.querySelector(`.ocard[data-id="${CSS.escape(id)}"] .fb button, .ocard[data-id="${CSS.escape(id)}"] .fb input`);
        if (first) first.focus({ preventScroll: true });
      }
    } else focusOrder(hash);
  }
  // after login from the landing page ("Recommander une référence"):
  // `serve` may drop the hash, so the intent is kept in sessionStorage
  let openFromIntent = false;
  try {
    openFromIntent = sessionStorage.getItem("atelierOpenReorder") === "1";
    sessionStorage.removeItem("atelierOpenReorder");
  } catch (_) { /* storage blocked */ }

  // wait for the entrance animation to start before scrolling / opening
  setTimeout(() => {
    if (openFromIntent && location.hash !== "#recommander") openReorder(null, $("reorder-open"));
    else handleHash();
  }, reduced ? 0 : 350);
  window.addEventListener("hashchange", handleHash);
})();
