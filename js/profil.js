/* =========================================================
   Givaudan Atelier — Mon profil (/profil)
   Account information (session), dedicated contact, usual requirements
   (localStorage "givaudanAtelier.profile", read by js/assistant.js),
   data copy request (simulated) and account deletion. Protected page (session.js guard).
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

  // an e-mail address stays on one line (no break at "-"), unless it is
  // wider than its box: then it breaks anywhere rather than overflow
  const emailSpan = (email) => h("span", { class: "email-text" }, email);

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
    if (s.email) {
      const dd = view.querySelector('[data-info="email"]');
      dd.textContent = "";
      dd.append(emailSpan(s.email));
    }
    set("status", s.existingClient ? "Client Givaudan" : "Nouveau client");
  }

  function messageFor(input) {
    const v = input.value.trim();
    // short messages: one line, even at 375 px (the line's space is reserved)
    if (input.required && !v) return `Renseignez ${input.dataset.label}.`;
    if (input.type === "email" && v && !EMAIL_RE.test(v)) return "E-mail invalide, ex. : nom@entreprise.com";
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

  // the error goes away while typing, as soon as the value is valid (never on
  // blur: a click on "Enregistrer" must not move the button under the pointer);
  // the full validation runs on submit
  Object.values(inputs).forEach((input) => {
    input.addEventListener("input", () => {
      if (input.getAttribute("aria-invalid") === "true" && !messageFor(input)) setError(input, "");
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
  const focusables = (dialog) => Array.from(dialog.querySelectorAll("button:not([disabled]), input:not([disabled]), a[href]"))
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

  /* ================= Mes données: data copy request =================
     Prototype: the request is only stored in givaudanAtelier.profile
     (cleared by Store.reset()); no e-mail is sent. */
  const requestModal = $("request-modal");
  const requestDialog = requestModal.querySelector(".modal-dialog");
  const requestForm = $("request-form");
  const requestDone = $("request-done");
  const requestSend = $("request-send");
  const requestNotice = $("request-notice");
  const boxes = Array.from(requestForm.querySelectorAll('input[name="categories"]'));

  function renderRequestStatus() {
    const P = Store.profile();
    const req = P && P.dataRequest;
    const line = $("data-request-status");
    line.hidden = !(req && req.date);
    if (req && req.date) {
      line.textContent = `Demande envoyée le ${window.AtelierClock.dateLabel(req.date)} — vous recevrez vos données par e-mail.`;
    }
  }
  const updateSend = () => { requestSend.disabled = !boxes.some((b) => b.checked); };

  // back to the form view, all boxes checked
  function resetRequestModal() {
    boxes.forEach((b) => { b.checked = true; });
    requestNotice.hidden = true;
    requestForm.hidden = false;
    requestDone.hidden = true;
    requestDialog.setAttribute("aria-labelledby", "request-title");
    updateSend();
  }

  $("data-request").addEventListener("click", () => {
    resetRequestModal();
    showModal(requestModal, boxes[0]);
  });
  boxes.forEach((b) => b.addEventListener("change", updateSend));

  requestForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const categories = boxes.filter((b) => b.checked).map((b) => b.value);
    if (!categories.length) return;
    const email = (S.get().email || "").trim();
    if (!email) {
      // no address to send the copy to: ask for it first
      requestNotice.hidden = false;
      $("request-add-email").focus();
      return;
    }
    Store.saveProfile({ dataRequest: { date: window.AtelierClock.nowISO(), categories } });
    renderRequestStatus();
    const doneText = $("request-done-text");
    doneText.textContent = "";
    doneText.append("Vous recevrez vos données par e-mail à ", emailSpan(email), " sous 30 jours maximum.");
    requestForm.hidden = true;
    requestDone.hidden = false;
    requestDialog.setAttribute("aria-labelledby", "request-done-title");
    $("request-done-title").focus({ preventScroll: true });
  });

  $("request-add-email").addEventListener("click", () => {
    hideModal(false);
    openEdit();
    inputs.email.focus();
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
  renderRequestStatus();
})();
