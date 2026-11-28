(async () => {
  "use strict";

  const S = window.AtelierSession;
  if (!await S.ready) return;

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
      if (s.pendingEmail) dd.append(h("small", {}, " · Confirmation en attente pour ", emailSpan(s.pendingEmail)));
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
    if (form.hasAttribute("aria-busy")) return;
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
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    let firstInvalid = null;
    Object.values(inputs).forEach((input) => {
      const msg = messageFor(input);
      setError(input, msg);
      if (msg && !firstInvalid) firstInvalid = input;
    });
    if (firstInvalid) { firstInvalid.focus(); return; }
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    const email = inputs.email.value.trim();
    button.disabled = true;
    form.setAttribute("aria-busy", "true");
    let saved = false;
    try {
      await S.saveProfile({
        firstName: inputs.firstName.value.trim(),
        lastName: inputs.lastName.value.trim(),
        company: inputs.company.value.trim(),
      });
      saved = true;
      const changed = email.toLowerCase() !== S.get().email?.toLowerCase();
      if (changed && email.toLowerCase() !== S.get().pendingEmail.toLowerCase()) {
        const { data, error } = await supabaseClient.auth.updateUser(
          { email }, { emailRedirectTo: new URL("profil", location.href).href },
        );
        if (error) throw error;
        S.get().email = data.user.email;
        S.get().pendingEmail = data.user.new_email || (data.user.email !== email ? email : "");
      }
      form.removeAttribute("aria-busy");
      closeEdit();
      toast(S.get().pendingEmail
        ? "Informations enregistrées. Suivez les liens de confirmation envoyés par e-mail."
        : "Vos informations sont enregistrées.");
    } catch (error) {
      if (saved) setError(inputs.email, "Informations enregistrées. Changement d’e-mail impossible.");
      else toast("Impossible d’enregistrer vos informations. Réessayez.");
    } finally {
      if (S.get()) renderInfo();
      button.disabled = false;
      form.removeAttribute("aria-busy");
    }
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
    return Store.usualConstraints() ?? (returningClient ? A.inferredConstraints() : []);
  }
  let returningClient = existing;
  async function saveHabits(list, message, focusKey) {
    const buttons = [...habitsList.querySelectorAll("button"), ...habitsAdd.querySelectorAll("button")];
    buttons.forEach((button) => { button.disabled = true; });
    try {
      await Store.saveUsualConstraints(list);
      habitsLive.textContent = message;
      renderHabits(focusKey);
    } catch {
      toast("Impossible d’enregistrer vos habitudes. Réessayez.");
      buttons.forEach((button) => { button.disabled = false; });
    }
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
            saveHabits(next, `${c} retiré de vos habitudes.`, { removed: list.indexOf(c) });
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
          saveHabits(currentHabits().concat(c), `${c} ajouté à vos habitudes.`, { added: c });
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
    if (modal.querySelector("[aria-busy=true]")) return;
    if (modal.id === "delete-modal") modal.querySelector("form").reset();
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
  const requestModal = $("request-modal");
  const requestDialog = requestModal.querySelector(".modal-dialog");
  const requestForm = $("request-form");
  const requestDone = $("request-done");
  const requestSend = $("request-send");
  const requestNotice = $("request-notice");
  const boxes = Array.from(requestForm.querySelectorAll('input[name="categories"]'));

  let latestRequestAt = 0;
  function renderRequestStatus(req) {
    const line = $("data-request-status");
    if (!req || Date.parse(req.created_at) < latestRequestAt) return;
    latestRequestAt = Date.parse(req.created_at);
    const statuses = { pending: "En attente", completed: "Traitée", rejected: "Refusée" };
    line.hidden = false;
    line.textContent = `Demande du ${window.AtelierClock.dateLabel(req.created_at)} · ${statuses[req.status]}`;
  }
  const updateSend = () => { requestSend.disabled = requestForm.hasAttribute("aria-busy") || !boxes.some((b) => b.checked); };

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

  requestForm.addEventListener("submit", async (e) => {
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
    if (requestSend.disabled) return;
    requestSend.disabled = true;
    requestForm.setAttribute("aria-busy", "true");
    try {
      const req = AtelierData.value(await supabaseClient.from("atelier_data_requests")
        .insert({ categories }).select("created_at,status").single());
      renderRequestStatus(req);
      $("request-done-text").textContent = "Votre demande est en attente de traitement.";
      requestForm.hidden = true;
      requestDone.hidden = false;
      requestDialog.setAttribute("aria-labelledby", "request-done-title");
      $("request-done-title").focus({ preventScroll: true });
    } catch {
      toast("Impossible d’enregistrer votre demande. Réessayez.");
    } finally {
      requestForm.removeAttribute("aria-busy");
      updateSend();
    }
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
  const deleteForm = $("delete-form");
  const deleteButton = $("delete-confirm");
  deleteForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (deleteButton.disabled) return;
    const verifiedPassword = $("delete-password").value;
    $("delete-password").value = "";
    $("delete-error").textContent = "";
    deleteButton.disabled = true;
    deleteForm.setAttribute("aria-busy", "true");
    try {
      await AtelierAPI.deleteAccount(verifiedPassword);
      await S.finishDeletion();
    } catch (error) {
      $("delete-error").textContent = error.message;
    } finally {
      deleteButton.disabled = false;
      deleteForm.removeAttribute("aria-busy");
    }
  });

  renderInfo();
  const request = supabaseClient.from("atelier_data_requests").select("created_at,status")
    .eq("owner", S.get().id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  request.then((result) => renderRequestStatus(AtelierData.value(result))).catch(AtelierData.report);
  if (await AtelierData.ready) {
    returningClient ||= Store.projects().some((project) => project.status !== "draft");
    renderHabits();
  }
})();
