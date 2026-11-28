/* =========================================================
   Givaudan Atelier — read-only brief (brief?projet=<id>)
   Works for the sample projects (js/samples.js) and for the projects
   saved by "Créer un projet". The internal "potentiel" is never shown.
   ========================================================= */
(async () => {
  "use strict";

  const S = window.AtelierSession;
  if (!S) return;
  await S.ready;

  const session = S.get();

  if (!session || session.role !== "client") return;
  if (!(await AtelierData.ready)) return;

  const doc = document.getElementById("doc");
  doc.removeAttribute("aria-live"); // only needed for the "introuvable" case below

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
  const frDate = (iso) => window.AtelierClock.dateLabel(iso); // demo date (js/clock.js)

  const id = new URLSearchParams(location.search).get("projet");
  const p = window.AtelierStore && window.AtelierStore.find(id);

  if (!p) {
    document.title = "Projet introuvable — Givaudan Atelier";
    doc.classList.add("doc--empty", "rise");
    doc.append(
      h("h1", { class: "space-title" }, "Ce projet est introuvable."),
      h("p", { class: "space-sub" }, "Il a peut-être été supprimé lors d'une réinitialisation de la démo."),
      h("a", { href: "mes-projets", class: "back-link" }, h("span", { "aria-hidden": "true" }, "← "), "Retour à Mes projets"));
    return;
  }

  document.title = `Brief · ${p.name} — Givaudan Atelier`;
  const b = p.brief || {};
  const expert = p.status === "expert";
  // named contact for existing clients, "nos experts" otherwise
  const contact = session.existingClient && p.contact ? p.contact : null;

  const STATUS = {
    expert: ["badge--expert", "Transmis à un expert"],
    proposed: ["badge--proposed", "Assemblages proposés"],
    requested: ["badge--requested", "Échantillon demandé"],
    shipped: ["badge--shipped", "Échantillon expédié"],
  };
  const [badgeClass, badgeText] = STATUS[p.status] || ["badge--draft", "Brouillon"];

  /* ---------------- head ---------------- */
  const meta = expert
    ? `Transmis le ${frDate(p.date)} ${contact ? `à ${contact}, Responsable de compte` : "à nos experts"}`
    : `Mis à jour le ${frDate(p.date)}`;
  const reassure = expert
    ? (contact
      ? "Votre interlocutrice étudie votre projet et vous recontacte sous 48 h."
      : "Nos experts étudient votre projet et vous recontactent sous 48 h.")
    : null;

  const head = h("header", { class: "doc-head rise" },
    h("span", { class: "eyebrow" }, expert ? "Brief transmis" : "Brief"),
    h("h1", { class: "space-title doc-title" }, p.name),
    h("p", { class: "doc-meta" }, meta),
    // imported brief: name of the document it was read from
    p.source && p.source.type === "import"
      ? h("p", { class: "doc-source" }, `Source : brief importé (${p.source.fileName || "document"})`)
      : null,
    h("div", { class: "doc-status" },
      h("span", { class: `badge ${badgeClass}` }, badgeText),
      reassure ? h("p", { class: "doc-reassure" }, reassure) : null));

  /* ---------------- the brief ---------------- */
  const join = (v) => (Array.isArray(v) ? v.join(", ") : v);
  const constraints = (b.constraints || [])[0] === "Aucune" ? "Aucune exigence particulière" : join(b.constraints);
  const row = (label, value) => h("div", { class: "doc-row" },
    h("dt", {}, label),
    h("dd", {}, value && (!Array.isArray(value) || value.length) ? value : h("span", { class: "doc-empty", "aria-label": "non renseigné" }, "—")));
  const notes = (b.notes || []).length
    ? h("ul", { class: "note-chips", role: "list" }, b.notes.map((n) => h("li", { class: "note-chip" }, n)))
    : null;

  const brief = h("section", { class: "doc-section rise", style: "--d: 0.1s", "aria-labelledby": "brief-title" },
    h("h2", { class: "doc-h2", id: "brief-title" }, "Votre brief"),
    h("dl", { class: "doc-list" },
      row("Produit", p.product),
      row("Cible", b.target),
      row("Ambiance", join(b.ambiance)),
      row("Notes pressenties", notes),
      row("Exigences", constraints),
      row("Intensité", b.intensity),
      row("Marché", b.market),
      row("Volume annuel", b.volume),
      row("Lancement", b.launch)));

  /* ---------------- blends ---------------- */
  // tags + "À confirmer par nos experts : …" on its own muted line (never the technical name)
  const INFO_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M12 11v6M12 7.5v.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  function blendTagLines(x) {
    const { tags, toConfirm } = window.AtelierStore.splitBlendTags(x);
    const out = [];
    if (tags) out.push(h("p", { class: "doc-blend-tags" }, tags));
    if (toConfirm.length) {
      const line = h("p", { class: "blend-confirm" }, h("span", { class: "blend-confirm-icon" }), `À confirmer par nos experts : ${toConfirm.join(", ")}`);
      line.querySelector(".blend-confirm-icon").innerHTML = INFO_ICON;
      out.push(line);
    }
    return out;
  }
  const blends = p.blends || [];
  const chosen = p.blend && (p.blend.id || p.blend);
  let blendSection = null;
  if (blends.length) {
    blendSection = h("section", { class: "doc-section rise", style: "--d: 0.2s", "aria-labelledby": "blends-title" },
      h("h2", { class: "doc-h2", id: "blends-title" }, "Assemblages proposés"),
      h("ul", { class: "doc-blends", role: "list" }, blends.map((x) => {
        const flag = x.id === chosen ? (expert ? "Discuté avec l'expert" : "Choisi")
          : x.id === p.favorite ? "Votre favori" : null;
        return h("li", { class: "doc-blend" },
          h("div", { class: "doc-blend-head" },
            h("span", { class: "doc-blend-name" }, x.name),
            h("span", { class: "doc-blend-family" }, x.family),
            flag ? h("span", { class: "doc-blend-flag" }, flag) : null),
          h("p", { class: "doc-blend-notes" }, `Tête : ${x.top} · Cœur : ${x.heart} · Fond : ${x.base}`),
          ...blendTagLines(x));
      })));
  }

  // why it went to an expert
  let note = p.expertNote || null;
  if (!note && expert && !chosen) {
    note = `Aucun assemblage ne convenait : brief transmis ${contact ? `à ${contact}` : "à nos experts"} le ${frDate(p.date)}.`;
  }
  const noteEl = note ? h("p", { class: "doc-note rise", style: "--d: 0.25s" }, note) : null;

  /* ---------------- actions ---------------- */
  const actions = h("div", { class: "doc-actions rise", style: "--d: 0.3s" },
    h("a", { href: "#", class: "btn btn-outline btn-small" }, contact ? `Contacter ${contact}` : "Contacter nos experts"),
    h("button", { type: "button", class: "btn btn-outline btn-small", onclick: () => window.print() }, "Imprimer"),
    h("a", { href: "mes-projets", class: "back-link doc-back-bottom" }, h("span", { "aria-hidden": "true" }, "← "), "Retour à Mes projets"));

  /* ---------------- sample feedback (Mes commandes) ---------------- */
  const O = window.AtelierOrders;
  let feedbackSection = null;
  const withFeedback = O ? O.list().filter((x) => x.projectId === p.id && x.feedback) : [];
  if (withFeedback.length) {
    feedbackSection = h("section", { class: "doc-section rise", style: "--d: 0.22s", "aria-labelledby": "fb-title" },
      h("h2", { class: "doc-h2", id: "fb-title" }, "Retour sur l'échantillon"),
      h("ul", { class: "doc-blends", role: "list" }, withFeedback.map((x) => {
        const fb = x.feedback;
        // one "Suite donnée" line, telling the dosage test and the retouch in order
        const orderNo = fb.adjustedOrder ? ` — N° ${fb.adjustedOrder}` : "";
        const next = fb.next === "dosage" ? "le client teste le dosage dans son produit"
          : fb.next === "adjusted_sample" ? `${fb.dosageTested ? "dosage testé, puis retouche demandée" : "retouche demandée"}${orderNo}`
          : O.feedbackNextLabel(fb, session.existingClient);
        const rt = fb.retouche;
        const retouchLines = rt ? [
          rt.adjustments && rt.adjustments.length ? ["Ajustements", rt.adjustments.map((a, i) => (i ? a.toLowerCase() : a)).join(", ")] : null,
          rt.emphasize && rt.emphasize.length ? ["Notes à renforcer", rt.emphasize.join(", ")] : null,
          rt.soften && rt.soften.length ? ["Notes à atténuer", rt.soften.join(", ")] : null,
          rt.note ? ["Précision", `« ${rt.note} »`] : null,
        ].filter(Boolean) : [];
        return h("li", { class: "doc-blend doc-fb" },
          h("div", { class: "doc-blend-head" },
            h("span", { class: "doc-blend-name" }, x.reference),
            h("span", { class: "doc-blend-family" }, `Échantillon N° ${x.number}`)),
          h("p", { class: "doc-fb-verdict" }, `Votre avis : ${O.feedbackLabel(x.feedback)}`,
            h("span", { class: "doc-fb-date" }, ` — le ${O.frDate(x.feedback.date)}`)),
          !rt && fb.note ? h("p", { class: "doc-blend-tags" }, `« ${fb.note} »`) : null,
          retouchLines.length
            ? h("dl", { class: "doc-fb-retouche" }, retouchLines.map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, v))))
            : null,
          next ? h("p", { class: "doc-fb-next" }, `Suite donnée : ${next}`) : null);
      })));
  }

  doc.append(...[head, brief, blendSection, feedbackSection, noteEl, actions].filter(Boolean));
})();
