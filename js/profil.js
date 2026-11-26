/* =========================================================
   Givaudan Atelier — Mon profil (/profil)
   Account information (session), dedicated contact, usual requirements
   (localStorage "givaudanAtelier.profile", read by js/assistant.js),
   data export and account deletion. Protected page (session.js guard).
   No API call on this page.
   ========================================================= */
(() => {
  "use strict";

  const S = window.AtelierSession;
  if (!S || !S.get()) return; // session.js already redirected to the login page

  const Store = window.AtelierStore;
  const A = window.AtelierAssistant;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

  /* ---------------- toast ---------------- */
  const toastEl = $("toast");
  let toastTimer = 0;
  function toast(text) {
    clearTimeout(toastTimer);
    toastEl.textContent = text;
    toastEl.classList.add("is-visible");
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2800);
  }

  /* ================= Mes informations ================= */
  const view = $("info-view");
  const form = $("info-form");
  const editBtn = $("info-edit");
  const inputs = {
    firstName: $("pf-firstname"),
    lastName: $("pf-lastname"),
    company: $("pf-company"),
    email: $("pf-email"),
  };

  function renderInfo() {
    const s = S.get();
    const set = (key, value, empty) => {
      const dd = view.querySelector(`[data-info="${key}"]`);
      dd.textContent = value || "Non renseigné";
      dd.classList.toggle("is-empty", empty || !value);
    };
    set("firstName", s.firstName);
    set("lastName", s.lastName);
    set("company", s.company);
    set("email", s.email);
    set("status", s.existingClient ? "Client Givaudan" : "Nouveau client");
  }

  function messageFor(input) {
    const v = input.value.trim();
    if (input.required && !v) return `Veuillez renseigner ${input.dataset.label}.`;
    if (input.type === "email" && v && !EMAIL_RE.test(v)) {
      return "Veuillez saisir une adresse e-mail valide, par exemple prenom.nom@entreprise.com.";
    }
    return "";
  }
  function setError(input, message) {
    const error = $(`${input.id}-error`);
    error.textContent = message;
    input.closest(".pfield").classList.toggle("has-error", Boolean(message));
    if (message) {
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", error.id);
    } else {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    }
  }

  function openEdit() {
    const s = S.get();
    Object.entries(inputs).forEach(([key, input]) => {
      input.value = s[key] || "";
      setError(input, "");
    });
    view.hidden = true;
    form.hidden = false;
    editBtn.hidden = true;
    inputs.firstName.focus();
  }
  function closeEdit() {
    form.hidden = true;
    view.hidden = false;
    editBtn.hidden = false;
    editBtn.focus({ preventScroll: true });
  }

  Object.values(inputs).forEach((input) => {
    input.addEventListener("input", () => {
      if (input.getAttribute("aria-invalid") === "true") setError(input, messageFor(input));
    });
  });
  editBtn.addEventListener("click", openEdit);
  $("info-cancel").addEventListener("click", closeEdit);
  form.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeEdit(); }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let firstInvalid = null;
    Object.values(inputs).forEach((input) => {
      const msg = messageFor(input);
      setError(input, msg);
      if (msg && !firstInvalid) firstInvalid = input;
    });
    if (firstInvalid) { firstInvalid.focus(); return; }
    // the header menu (initials, name) is repainted by AtelierSession.update;
    // the other pages read the session when they load
    S.update({
      firstName: inputs.firstName.value.trim(),
      lastName: inputs.lastName.value.trim(),
      company: inputs.company.value.trim(),
      email: inputs.email.value.trim(),
    });
    renderInfo();
    closeEdit();
    toast("Vos informations sont enregistrées.");
  });

  /* ================= Mon interlocutrice ================= */
  // same rule as Messages: Claire Martin for a Givaudan client, the team otherwise
  const existing = Boolean(S.get().existingClient);
  document.querySelector('[data-contact-mode="client"]').hidden = !existing;
  document.querySelector('[data-contact-mode="new"]').hidden = existing;

  /* ================= Mes habitudes ================= */
  const habitsList = $("habits-current");
  const habitsAdd = $("habits-add");
  const habitsLive = $("habits-live");
  const allChips = A && A.constraintChips ? A.constraintChips() : ["Naturel", "Vegan", "Sans allergène majeur", "Biodégradable"];

  // what the assistant will propose: Mon profil when edited, otherwise the history
  function currentHabits() {
    const P = Store.profile();
    if (P && P.edited && Array.isArray(P.usualConstraints)) return P.usualConstraints.slice();
    return existing && A && A.inferredConstraints ? A.inferredConstraints() : [];
  }
  function saveHabits(list) {
    Store.saveProfile({ usualConstraints: list, edited: true });
  }

  function renderHabits(focusKey) {
    const list = currentHabits();
    habitsList.textContent = "";
    list.forEach((c) => {
      habitsList.append(h("li", {},
        h("button", {
          type: "button", class: "chip habit-chip is-active", "data-habit": c,
          "aria-label": `Retirer ${c}`,
          onclick: () => {
            const next = currentHabits().filter((x) => x !== c);
            saveHabits(next);
            habitsLive.textContent = `${c} retiré de vos habitudes.`;
            renderHabits({ removed: list.indexOf(c) });
          },
        }, c, h("span", { class: "habit-x", "aria-hidden": "true" }, "×"))));
    });
    $("habits-empty").hidden = list.length > 0;

    habitsAdd.textContent = "";
    const available = allChips.filter((c) => !list.includes(c));
    available.forEach((c) => {
      habitsAdd.append(h("button", {
        type: "button", class: "chip habit-add-chip", "data-add": c,
        onclick: () => {
          saveHabits(currentHabits().concat(c));
          habitsLive.textContent = `${c} ajouté à vos habitudes.`;
          renderHabits({ added: c });
        },
      }, h("span", { "aria-hidden": "true" }, "+ "), c));
    });
    $("habits-add-label").hidden = available.length === 0;
    habitsAdd.hidden = available.length === 0;

    // keep the keyboard focus nearby after a change
    if (!focusKey) return;
    let target = null;
    if (focusKey.added) target = habitsList.querySelector(`[data-habit="${CSS.escape(focusKey.added)}"]`);
    if (focusKey.removed != null) {
      const chips = habitsList.querySelectorAll("button");
      target = chips[Math.min(focusKey.removed, chips.length - 1)] || habitsAdd.querySelector("button");
    }
    if (target) target.focus({ preventScroll: true });
  }

  /* ================= modals (focus trap, Escape) ================= */
  let openModal = null;
  let lastFocus = null;
  let modalTimer = 0;
  const focusables = (dialog) => Array.from(dialog.querySelectorAll("button:not([disabled]), textarea, a[href]"))
    .filter((el) => el.offsetParent !== null);

  function showModal(modal, firstFocus) {
    clearTimeout(modalTimer);
    if (openModal && openModal !== modal) hideModal(false);
    lastFocus = document.activeElement;
    openModal = modal;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add("is-open")));
    (firstFocus || modal.querySelector(".modal-dialog")).focus({ preventScroll: true });
  }
  function hideModal(restoreFocus = true) {
    if (!openModal) return;
    const modal = openModal;
    openModal = null;
    modal.classList.remove("is-open");
    document.body.classList.remove("modal-open");
    modalTimer = setTimeout(() => { modal.hidden = true; }, reduced ? 0 : 600);
    if (restoreFocus && lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  document.querySelectorAll("[data-modal-dismiss]").forEach((n) => n.addEventListener("click", () => hideModal()));
  document.addEventListener("keydown", (e) => {
    if (!openModal) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hideModal(); return; }
    if (e.key !== "Tab") return;
    const dialog = openModal.querySelector(".modal-dialog");
    const items = focusables(dialog);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (!dialog.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ================= Mes données ================= */
  const PREFIX = "givaudanAtelier.";
  const SALES_ONLY = ["givaudanAtelier.salesActions", "givaudanAtelier.salesInbox"];

  // every givaudanAtelier.* key of the client (not the Espace commercial ones)
  function buildExport() {
    const data = {};
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(PREFIX) || SALES_ONLY.includes(key)) continue;
        const raw = localStorage.getItem(key);
        let value = raw;
        try { value = JSON.parse(raw); } catch (_) { /* keep the raw text */ }
        data[key.slice(PREFIX.length)] = value;
      }
    } catch (_) { /* storage blocked: export what we could read */ }
    return {
      exportedAt: new Date().toISOString(),
      app: "Givaudan Atelier (prototype)",
      data,
    };
  }

  const FILE_NAME = "mes-donnees-givaudan-atelier.json";
  const inFrame = (() => { try { return window.self !== window.top; } catch (_) { return true; } })();

  function showExportModal(json) {
    $("export-json").value = json;
    showModal($("export-modal"), $("export-copy"));
  }

  $("data-download").addEventListener("click", () => {
    const json = JSON.stringify(buildExport(), null, 2);
    let started = false;
    try {
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const link = h("a", { href: url, download: FILE_NAME, hidden: true });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      started = true;
    } catch (_) {
      started = false;
    }
    // inside an embedded page (e.g. a published artifact) the download may be
    // silently blocked: also offer the data to copy
    if (!started || inFrame) showExportModal(json);
    else toast("Téléchargement lancé.");
  });

  $("export-copy").addEventListener("click", async () => {
    const area = $("export-json");
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(area.value);
        copied = true;
      }
    } catch (_) { copied = false; }
    if (!copied) {
      try {
        area.focus();
        area.select();
        copied = document.execCommand("copy");
      } catch (_) { copied = false; }
    }
    toast(copied ? "Données copiées." : "Sélectionnez le texte puis copiez-le.");
  });

  /* ---------------- Supprimer mon compte ---------------- */
  const deleteModal = $("delete-modal");
  $("data-delete").addEventListener("click", () => {
    // the safe choice gets the focus first
    showModal(deleteModal, deleteModal.querySelector(".modal-actions .btn-outline"));
  });
  $("delete-confirm").addEventListener("click", () => {
    Store.reset(); // projects, orders, messages, preferences…
    S.logout();
    S.rememberNext(null);
    S.rememberIntent(null);
    S.flagDeleted(); // "Votre compte a été supprimé." on the home page
    location.href = "./";
  });

  /* ---------------- start ---------------- */
  renderInfo();
  renderHabits();
})();
