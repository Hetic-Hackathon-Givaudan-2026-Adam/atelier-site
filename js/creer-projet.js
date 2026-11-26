/* Conversation projet, import de brief et sauvegarde via FastAPI. */
(async () => {
  "use strict";

  const S = window.AtelierSession;
  if (!S) return;
  await S.ready;

  const session = S.get();

  if (!session || session.role !== "client") return;
  if (!(await AtelierData.ready)) return;

  const { getAssistantTurn, projectName } = window.AtelierAssistant;
  // blends on screen: the project's own (resumed project or RAG bank), otherwise the scenario's —
  // none when the RAG API found no blend close enough (noMatch: expert path)
  const offeredBlends = () => state.blends || [];
  const Store = window.AtelierStore;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));

  const $ = (sel) => document.querySelector(sel);
  const thread = $("#thread");
  const form = $("#composer");
  const input = $("#composer-input");
  const sendBtn = form.querySelector(".composer-send");
  const announcer = $("#announcer");
  const brief = $(".brief");
  const briefToggle = $("#brief-toggle");
  const countEl = $("#brief-count");
  const fieldsEl = $("#brief-fields");
  const stageEls = Array.from(document.querySelectorAll(".brief-steps li"));
  const header = $(".site-header");

  const FIELDS = ["product", "target", "ambiance", "notes", "constraints", "intensity", "market", "volume", "launch"];
  const DEFAULT_PLACEHOLDER = "Décrivez votre projet…";

  let state;
  let runId = 0;        // bumped on restart: pending turns are dropped
  let busy = false;
  let lastVia = "load"; // "chip" | "text" | "load": decides where focus goes
  let activeChoices = null;
  let openSummary = null; // { userMsg, msg, form }
  let pendingProjectId;
  let transcript = [];
  // ?projet=<id> → resume that project ("Reprendre" in Mes projets)
  let resumeId = new URLSearchParams(location.search).get("projet");

  const freshState = () => ({
    step: null,
    projectId: null, projectName: null, blends: [], favorite: null, created: null,
    source: null, // { type: "import", fileName } for an imported brief
    fromProject: null, // { id, name, ambiance, notes, intensity } when started from an existing project
    firstName: session.firstName,
    existingClient: Store.projects().some((project) => project.status !== "draft"),
    product: null, target: null, ambiance: [], notes: [], constraints: [], intensity: null,
    market: null, volume: null, launch: null, potential: null, blend: null, status: null,
    noMatch: false, // the RAG API found no blend close enough (expert path)
  });

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
  const mono = () => h("span", { class: "mono", "aria-hidden": "true" }, "GA");

  /* ---------------- layout helpers ---------------- */
  // focus / native scrolling must never leave a control under the fixed
  // header (top) or the sticky composer (bottom)
  function setHeaderH() {
    const root = document.documentElement.style;
    root.setProperty("--header-h", `${header.offsetHeight}px`);
    root.scrollPaddingTop = `${topOffset()}px`;
    root.scrollPaddingBottom = `${form.offsetHeight + 12}px`;
  }
  setHeaderH();
  window.addEventListener("resize", setHeaderH);

  function topOffset() {
    let top = header.offsetHeight + 16;
    if (getComputedStyle(briefToggle).display !== "none") top += briefToggle.offsetHeight;
    return top;
  }
  // keep the newest element in view, above the sticky composer
  function scrollToEl(el) {
    requestAnimationFrame(() => {
      if (!el.isConnected) return;
      const r = el.getBoundingClientRect();
      const top = topOffset();
      const bottom = window.innerHeight - form.offsetHeight - 16;
      const y = r.height > bottom - top ? window.scrollY + r.top - top : window.scrollY + r.bottom - bottom;
      if (y > window.scrollY + 1 || r.top < top) {
        window.scrollTo({ top: Math.max(0, y), behavior: reduced ? "auto" : "smooth" });
      }
    });
  }

  function announce(text) {
    announcer.textContent = "";
    setTimeout(() => { announcer.textContent = text; }, 60);
  }

  /* ---------------- project card ---------------- */
  function fieldValue(key) {
    const v = state[key];
    if (Array.isArray(v)) {
      if (!v.length) return null;
      if (key === "notes") return v;
      if (key === "constraints" && v[0] === "Aucune") return "Aucune exigence particulière";
      return v.join(", ");
    }
    return v || null;
  }

  // animate: soft entrance · changed: pink underline after a brief modification
  function renderField(key, animate = true, changed = false) {
    const row = fieldsEl.querySelector(`[data-field="${key}"]`);
    if (!row) return;
    const dd = row.querySelector("dd");
    const val = fieldValue(key);
    const sig = JSON.stringify(val);
    if (dd.dataset.sig === sig) return;
    dd.dataset.sig = sig;
    dd.textContent = "";
    row.classList.toggle("is-filled", Boolean(val));
    row.classList.remove("is-new", "is-changed");
    if (changed && val) {
      void row.offsetWidth; // restart the highlight
      row.classList.add("is-changed");
    }

    if (!val) {
      dd.append(h("span", { class: "field-empty" }, h("span", { "aria-hidden": "true" }, "—"), h("span", { class: "sr-only" }, "non renseigné")));
    } else if (key === "notes") {
      const ul = h("ul", { class: "note-chips", role: "list" });
      val.forEach((n, i) => ul.append(h("li", { class: "note-chip", style: `--i:${i}` }, n)));
      dd.append(ul);
    } else {
      dd.append(h("span", { class: "field-value" }, val));
    }
    if (val && animate && !changed && !reduced) {
      void row.offsetWidth; // restart the animation
      row.classList.add("is-new");
    }
  }

  function updateCount() {
    const n = FIELDS.filter((k) => fieldValue(k)).length;
    const text = `· ${n} élément${n > 1 ? "s" : ""}`;
    if (countEl.textContent !== text) {
      countEl.textContent = text;
      if (!reduced) {
        briefToggle.classList.remove("is-pulse");
        void briefToggle.offsetWidth;
        briefToggle.classList.add("is-pulse");
      }
    }
  }

  // 0 Votre projet · 1 Vos envies · 2 Vos assemblages · 3 Échantillon
  function setStage(active, doneUpTo = active - 1) {
    stageEls.forEach((li, i) => {
      li.classList.toggle("is-done", i <= doneUpTo);
      li.classList.toggle("is-active", i === active);
      if (i === active) li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
    });
  }
  function stageForStep(step) {
    if (step === "product" || step === null || step === "import" || step === "import-analysis") return setStage(0);
    if (step === "import-review") return setStage(1);
    if (step === "choose-project") return setStage(0);
    if (typeof step === "string" && step.startsWith("from-")) return setStage(1);
    if (["ambiance", "constraints", "intensity", "business"].includes(step)) return setStage(1);
    if (step === "edit" || (typeof step === "string" && step.startsWith("edit-"))) return setStage(1);
    if (step === "reveal") return setStage(2);
    if (step === "done") return state.status === "requested" ? setStage(-1, 3) : setStage(-1, 2);
  }

  function applyUpdates(updates = {}, changed = []) {
    // a new modification: only its own fields keep the highlight
    if (changed.length) fieldsEl.querySelectorAll(".field.is-changed").forEach((r) => r.classList.remove("is-changed"));
    Object.entries(updates).forEach(([k, v]) => { state[k] = v; });
    FIELDS.forEach((k) => { if (k in updates) renderField(k, true, changed.includes(k)); });
    updateCount();
  }

  /* ---------------- pencil icons: edit a topic from the project card ---------------- */
  const EDIT_TOPICS = {
    ambiance: ["ambiance", "Modifier l'ambiance"],
    notes: ["ambiance", "Modifier les notes pressenties"],
    constraints: ["constraints", "Modifier les exigences"],
    intensity: ["intensity", "Modifier l'intensité"],
    market: ["business", "Modifier le marché"],
    volume: ["business", "Modifier le volume"],
    launch: ["business", "Modifier le lancement"],
  };
  const PENCIL = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  Object.entries(EDIT_TOPICS).forEach(([key, [topic, label]]) => {
    const row = fieldsEl.querySelector(`[data-field="${key}"]`);
    const btn = h("button", { type: "button", class: "field-edit", "aria-label": label, title: label, hidden: true });
    btn.innerHTML = PENCIL;
    btn.addEventListener("click", () => editTopic(topic));
    row.append(btn);
  });

  // available once the blends have been proposed, for fields that have a value
  function refreshPencils() {
    const step = state.step || "";
    const open = !busy && (step === "reveal" || step === "edit" || step.startsWith("edit-"));
    fieldsEl.querySelectorAll(".field-edit").forEach((btn) => {
      btn.hidden = !(open && btn.closest(".field").classList.contains("is-filled"));
    });
  }

  function editTopic(topic) {
    if (busy) return;
    lastVia = "chip";
    lockActive();
    lockOffers();
    if (brief.classList.contains("is-open")) briefToggle.click(); // mobile: back to the conversation
    runTurn({ type: "action", action: "edit_topic", topic });
  }

  briefToggle.addEventListener("click", () => {
    const open = !brief.classList.contains("is-open");
    brief.classList.toggle("is-open", open);
    briefToggle.setAttribute("aria-expanded", String(open));
  });

  /* ---------------- messages ---------------- */
  function postUser(text) {
    const el = h("div", { class: "msg msg--user" },
      h("p", { class: "msg-bubble" }, h("span", { class: "sr-only" }, "Vous : "), text));
    thread.append(el);
    scrollToEl(el);
    return el;
  }

  // "*word*" in an assistant message → <em>word</em> (text nodes only, no HTML injection)
  const rich = (text) => String(text).split(/\*([^*]+)\*/).map((part, i) => (i % 2 ? h("em", {}, part) : part));
  const plain = (text) => String(text).replace(/\*([^*]+)\*/g, "$1");

  function atelierMsg(text) {
    const body = h("div", { class: "msg-body" },
      h("p", { class: "msg-text" }, h("span", { class: "sr-only" }, "L'Atelier : "), rich(text)));
    const el = h("div", { class: "msg msg--atelier" }, mono(), body);
    thread.append(el);
    return { el, body };
  }

  function showTyping() {
    const el = h("div", { class: "msg msg--atelier msg--typing", "aria-hidden": "true" },
      mono(), h("span", { class: "dots" }, h("i"), h("i"), h("i")));
    thread.append(el);
    scrollToEl(el);
    return el;
  }

  function setBusy(on) {
    busy = on;
    sendBtn.disabled = on;
    thread.setAttribute("aria-busy", String(on));
    if (state) refreshPencils();
  }

  /* ---------------- one assistant turn ---------------- */
  async function runTurn(userInput, replay) {
    const id = ++runId;
    setBusy(true);
    const typing = reduced ? null : showTyping();
    let turn;
    function retry(error) {
      const { body } = atelierMsg(`Le tour n’a pas été enregistré. ${error.message || "Réessayez."}`);
      body.append(h("button", { type: "button", class: "btn btn-outline", onclick: () => {
        body.closest(".msg").remove();
        runTurn(userInput, turn);
      } }, "Réessayer"));
    }
    const before = structuredClone(state);
    let committed = false;
    try {
      turn = replay || await getAssistantTurn(before, userInput);
      if (id !== runId) return;
      if (typing) typing.remove();
      applyUpdates(turn.projectUpdates, turn.changed || []);
      state.step = turn.step || state.step;
      if (turn.blends) {
        state.blends = turn.blends;
        state.noMatch = Boolean(turn.noMatch) || !turn.blends.length;
      }
      if (userInput && userInput.action !== "resume" && userInput.action !== "choose_project") {
        const history = [...transcript, { input: userInput, reply: turn.message }];
        await persist(history, turn, id);
        if (id !== runId) return;
        transcript = history;
        committed = true;
      }
      await renderTurn(turn, id);
    } catch (error) {
      if (id !== runId) return;
      if (committed) { AtelierData.report(error); return; }
      state = before;
      FIELDS.forEach((key) => renderField(key, false));
      updateCount();
      if (typing) typing.remove();
      retry(error);
    } finally {
      if (id === runId) setBusy(false);
    }
  }

  async function renderTurn(turn, id) {
    const changed = turn.changed || [];

    // fields taken from an existing project: small "repris de …" tag
    if (turn.prefilled) {
      turn.prefilled.forEach((k) => {
        const dd = fieldsEl.querySelector(`[data-field="${k}"] dd`);
        if (dd && !dd.querySelector(".field-origin")) dd.append(" ", h("span", { class: "field-origin" }, `repris de ${turn.prefilledFrom}`));
      });
    }
    if (turn.step) state.step = turn.step;
    stageForStep(state.step);
    input.placeholder = turn.placeholder || (state.step === "done" ? "Une question ? Écrivez-nous…" : DEFAULT_PLACEHOLDER);

    const { el, body } = atelierMsg(turn.message);
    // say which fields of the project card were updated
    const labels = changed.map((k) => {
      const row = fieldsEl.querySelector(`[data-field="${k}"] dt`);
      return row ? row.textContent : null;
    }).filter(Boolean);
    announce(plain(turn.message) + (labels.length ? ` Mis à jour : ${labels.join(", ")}.` : ""));
    let focusTarget = null;

    if (turn.recap) body.append(recapCard());
    if (turn.projectChoices) focusTarget = renderProjectChoices(body, turn.projectChoices);
    // first turn of a new project: "Discuter avec l'Atelier" / "Importer mon brief"
    if (turn.entry && turn.chips) focusTarget = renderEntry(body, turn);
    else if (turn.chips) focusTarget = renderChoices(body, turn);
    if (turn.groups) focusTarget = renderGroups(body, turn.groups, turn.selectedGroups);
    scrollToEl(el);

    if (turn.blends) {
      state.blends = turn.blends;
      state.noMatch = Boolean(turn.noMatch) || !turn.blends.length;
      focusTarget = await revealBlends(body, turn.blends, id, !turn.resume && turn.blends.length > 0);
      if (id !== runId) return;
      scrollToEl(el);
    }
    if (turn.action && turn.action.type === "sample") {
      focusTarget = renderSummary(el, body, turn.action.blendId);
      scrollToEl(el);
    }
    if (state.step === "done") {
      lockOffers();
      body.append(turn.confirmation ? confirmationCard(turn.confirmation) : projectLink());
      focusTarget = body.querySelector(".btn, .side-link");
      scrollToEl(el);
    }

    if (lastVia === "text") input.focus({ preventScroll: true });
    else if (lastVia === "chip" && focusTarget) focusTarget.focus({ preventScroll: true });
  }

  /* ---------------- chips ---------------- */
  function lockActive(chosen = []) {
    if (!activeChoices) return;
    activeChoices.querySelectorAll("button").forEach((b) => {
      b.disabled = true;
      if (chosen.includes(b.dataset.value) || b.getAttribute("aria-pressed") === "true") b.classList.add("is-chosen");
    });
    activeChoices.classList.add("is-locked");
    activeChoices = null;
  }

  function renderChoices(body, turn) {
    const multiple = turn.multiple;
    const wrap = h("div", { class: "choices" });
    const group = h("div", {
      class: "choice-list", role: "group",
      "aria-label": multiple ? "Choisissez une ou plusieurs réponses" : "Choisissez une réponse",
    });
    // when a question is asked again ("Modifier mon brief"), the current answers are pre-selected
    const selected = turn.selected || [];
    const picked = multiple ? selected.filter((v) => turn.chips.includes(v)) : [];
    const exclusive = ["Je ne sais pas", "Aucune"];
    let validate = null;

    turn.chips.forEach((label) => {
      const current = selected.includes(label);
      const b = h("button", {
        type: "button",
        class: !multiple && current ? "chip choice is-current" : "chip choice",
        "data-value": label,
        "aria-pressed": multiple ? String(current) : null,
      }, label, !multiple && current ? h("span", { class: "sr-only" }, " (choix actuel)") : null);
      b.addEventListener("click", () => {
        if (busy) return;
        if (!multiple) {
          lastVia = "chip";
          lockActive([label]);
          postUser(label);
          runTurn({ type: "chips", values: [label] });
          return;
        }
        const on = b.getAttribute("aria-pressed") !== "true";
        // "Je ne sais pas" / "Aucune" cannot be combined with other answers
        group.querySelectorAll("button").forEach((o) => {
          if (o !== b && on && (exclusive.includes(label) || exclusive.includes(o.dataset.value))) {
            o.setAttribute("aria-pressed", "false");
            const i = picked.indexOf(o.dataset.value);
            if (i > -1) picked.splice(i, 1);
          }
        });
        b.setAttribute("aria-pressed", String(on));
        if (on) picked.push(label);
        else picked.splice(picked.indexOf(label), 1);
        validate.disabled = !picked.length;
      });
      group.append(b);
    });
    wrap.append(group);

    if (multiple) {
      validate = h("button", { type: "button", class: "btn btn-ink btn-small choice-validate", disabled: !picked.length }, "Valider");
      validate.addEventListener("click", () => {
        if (busy || !picked.length) return;
        lastVia = "chip";
        const values = picked.slice();
        lockActive(values);
        validate.remove();
        postUser(values.join(", "));
        runTurn({ type: "chips", values });
      });
      wrap.append(h("div", { class: "choice-foot" },
        h("span", { class: "choice-hint" }, "Plusieurs choix possibles"), validate));
      // returning client: requirements pre-selected from earlier projects
      if (turn.hint) wrap.insertBefore(h("p", { class: "choice-history" }, turn.hint), wrap.lastElementChild);
    }
    body.append(wrap);
    activeChoices = wrap;
    return group.querySelector("button");
  }

  let groupSeq = 0; // the business question can be asked twice: unique ids
  function renderGroups(body, groups, preset = {}) {
    const wrap = h("div", { class: "choices choices--groups" });
    const values = {};
    groups.forEach((g) => { if (g.chips.includes(preset[g.key])) values[g.key] = preset[g.key]; });
    const validate = h("button", {
      type: "button", class: "btn btn-ink btn-small choice-validate",
      disabled: groups.some((x) => !values[x.key]),
    }, "Valider");
    groupSeq++;

    groups.forEach((g) => {
      const legendId = `g-${g.key}-${groupSeq}`;
      const list = h("div", { class: "choice-list", role: "group", "aria-labelledby": legendId });
      g.chips.forEach((label) => {
        const b = h("button", {
          type: "button", class: "chip choice", "data-value": label,
          "aria-pressed": String(values[g.key] === label),
        }, label);
        b.addEventListener("click", () => {
          if (busy) return;
          list.querySelectorAll("button").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
          values[g.key] = label;
          validate.disabled = groups.some((x) => !values[x.key]);
        });
        list.append(b);
      });
      wrap.append(h("div", { class: "choice-group" }, h("p", { class: "choice-legend", id: legendId }, g.label), list));
    });

    validate.addEventListener("click", () => {
      if (busy || groups.some((x) => !values[x.key])) return;
      lastVia = "chip";
      lockActive();
      validate.remove();
      postUser(groups.map((g) => values[g.key]).join(" · "));
      runTurn({ type: "groups", values: { ...values } });
    });
    wrap.append(h("div", { class: "choice-foot" }, validate));
    body.append(wrap);
    activeChoices = wrap;
    return wrap.querySelector("button");
  }

  /* ---------------- reveal ---------------- */
  const DISCS = `<svg viewBox="0 0 72 32" width="72" height="32" aria-hidden="true" focusable="false">
    <circle cx="18" cy="16" r="11"/><circle cx="36" cy="16" r="11"/><circle cx="54" cy="16" r="11"/></svg>`;

  async function revealBlends(body, list, id, compose = true) {
    if (compose) {
      const comp = h("div", { class: "composing", "aria-hidden": "true" });
      comp.innerHTML = `${DISCS}<span class="composing-line"></span><span class="composing-label">Composition de vos assemblages…</span>`;
      body.append(comp);
      scrollToEl(comp);
      await wait(1300);
      if (id !== runId) return null;
      comp.remove();
    }

    // no blend close enough in the bank (RAG API, noMatch): the message says so, one clear expert button
    if (!list.length) {
      const btn = h("button", { type: "button", class: "btn btn-primary btn-small", "data-offer": "", onclick: () => chooseExpert(null) },
        "Transmettre mon brief à un expert");
      body.append(h("div", { class: "blends-none" }, btn));
      return btn;
    }

    const wrap = h("div", { class: "blends" });
    body.append(wrap);
    for (const b of list) {
      wrap.append(blendCard(b));
      scrollToEl(wrap);
      await wait(280);
      if (id !== runId) return null;
    }
    body.append(h("p", { class: "blends-alt" },
      h("button", { type: "button", class: "link-btn", "data-offer": "", onclick: () => chooseExpert(null) },
        "Aucun ne me convient — échanger avec un expert")));
    const fav = list.find((b) => b.id === state.favorite);
    announce(`${list.length} assemblages proposés : ${list.map((b) => b.name).join(", ")}.${fav ? ` Votre favori : ${fav.name}.` : ""}`);
    return wrap.querySelector(".btn");
  }

  // tags line + "À confirmer par nos experts : Naturel, Vegan" (requirements unknown for this blend)
  const INFO_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M12 11v6M12 7.5v.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  function blendTagLines(b) {
    const { tags, toConfirm } = Store.splitBlendTags(b);
    const out = [];
    if (tags) out.push(h("p", { class: "blend-tags" }, tags));
    if (toConfirm.length) {
      const p = h("p", { class: "blend-confirm" }, h("span", { class: "blend-confirm-icon" }), `À confirmer par nos experts : ${toConfirm.join(", ")}`);
      p.querySelector(".blend-confirm-icon").innerHTML = INFO_ICON;
      out.push(p);
    }
    return out;
  }

  function blendCard(b) {
    const titleId = `blend-${b.id}`;
    const favorite = b.id === state.favorite;
    const row = (label, text) => h("div", {}, h("dt", {}, label), h("dd", {}, text));
    return h("article", { class: favorite ? "blend blend--favorite" : "blend", "aria-labelledby": titleId },
      h("div", { class: "blend-top" },
        h("span", { class: "blend-family" }, b.family),
        h("span", { class: "blend-labels" },
          favorite ? h("span", { class: "blend-fav" }, "Votre favori") : null,
          b.match ? h("span", { class: "blend-match" }, b.match) : null,
          // already rated "il convient" by this client
          b.liked ? h("span", { class: "blend-match blend-liked" }, "Vous l'aviez apprécié pour ", h("em", {}, b.liked)) : null)),
      h("h3", { class: "blend-title", id: titleId }, b.name),
      h("dl", { class: "pyramid" }, row("Tête", b.top), row("Cœur", b.heart), row("Fond", b.base)),
      ...blendTagLines(b),
      h("div", { class: "blend-actions" },
        h("button", { type: "button", class: "btn btn-primary btn-small", "data-offer": "", onclick: () => askSample(b) },
          "Demander un échantillon", h("span", { class: "sr-only" }, ` : ${b.name}`)),
        h("button", { type: "button", class: "btn btn-outline btn-small", "data-offer": "", onclick: () => chooseExpert(b) },
          "Échanger avec un expert", h("span", { class: "sr-only" }, ` à propos de ${b.name}`))));
  }

  // after the decision (or a brief edit), the offers can no longer be used
  function lockOffers() {
    thread.querySelectorAll("[data-offer]").forEach((b) => { b.disabled = true; });
    if (openSummary) {
      openSummary.form.querySelectorAll("input, select, textarea, button").forEach((c) => { c.disabled = true; });
      openSummary.form.classList.add("is-locked");
    }
  }

  function dropOpenSummary() {
    if (!openSummary || openSummary.form.classList.contains("is-locked")) return;
    openSummary.userMsg.remove();
    openSummary.msg.remove();
    openSummary = null;
  }

  /* ---------------- 7a · sample request ---------------- */
  function askSample(blend) {
    if (busy || state.step === "done") return;
    lastVia = "chip";
    dropOpenSummary();
    const userMsg = postUser(`Je souhaite recevoir un échantillon de ${blend.name}.`);
    const id = ++runId;
    setBusy(true);
    const typing = reduced ? null : showTyping();
    wait(900).then(async () => {
      if (id !== runId) return;
      if (typing) typing.remove();
      await renderTurn({ message: "Parfait. Voici le récapitulatif de votre demande.", step: state.step,
        action: { type: "sample", blendId: blend.id } }, id);
      if (openSummary) openSummary.userMsg = userMsg;
      setBusy(false);
    });
  }

  function renderSummary(msgEl, body, blendId) {
    const list = offeredBlends();
    const blend = list.find((b) => b.id === blendId) || list[0];
    const company = session.company || `Maison ${session.lastName}`;
    let address = "12 rue de la Paix, 75002 Paris";

    const nameInput = h("input", { class: "summary-input", id: "sum-name", type: "text", value: state.projectName || projectName(state) });
    const format = h("select", { class: "summary-select", id: "sum-format" },
      h("option", { value: "Échantillon 50 ml" }, "Échantillon 50 ml"),
      h("option", { value: "Échantillon 100 ml" }, "Échantillon 100 ml"));
    const addrText = h("span", { class: "summary-address-line" }, address);
    const addrField = h("textarea", { class: "summary-textarea", id: "sum-address", rows: "2", hidden: true });
    addrField.value = address;
    const addrLabel = h("label", { class: "sr-only", for: "sum-address" }, "Adresse de livraison");
    const edit = h("button", { type: "button", class: "link-btn summary-edit", "aria-expanded": "false", "aria-controls": "sum-address" }, "Modifier");
    edit.addEventListener("click", () => {
      const editing = edit.getAttribute("aria-expanded") === "true";
      if (editing) {
        address = addrField.value.trim() || address;
        addrText.textContent = address;
      }
      addrField.hidden = editing;
      addrText.hidden = !editing;
      edit.setAttribute("aria-expanded", String(!editing));
      edit.textContent = editing ? "Modifier" : "OK";
      if (!editing) addrField.focus();
    });

    const confirm = h("button", { type: "submit", class: "btn btn-primary btn-small" }, "Confirmer la demande");
    const editBrief = h("button", { type: "button", class: "btn btn-outline btn-small" }, "Modifier mon brief");

    const f = h("form", { class: "summary", "aria-label": "Récapitulatif de la demande d'échantillon" },
      h("p", { class: "summary-eyebrow" }, "Récapitulatif"),
      h("div", { class: "summary-row" },
        h("label", { class: "summary-label", for: "sum-name" }, "Projet"),
        h("div", { class: "summary-value" }, nameInput)),
      h("div", { class: "summary-row" },
        h("span", { class: "summary-label" }, "Assemblage"),
        h("div", { class: "summary-value" }, h("span", { class: "summary-strong" }, blend.name), h("span", { class: "summary-sub" }, blend.family))),
      h("div", { class: "summary-row" },
        h("label", { class: "summary-label", for: "sum-format" }, "Format"),
        h("div", { class: "summary-value" }, format)),
      h("div", { class: "summary-row" },
        h("span", { class: "summary-label" }, "Livraison"),
        h("div", { class: "summary-value" },
          h("span", { class: "summary-strong" }, company),
          h("span", { class: "summary-address" }, addrText, addrLabel, addrField, edit))),
      h("div", { class: "summary-actions" }, confirm, editBrief));

    f.addEventListener("submit", (e) => {
      e.preventDefault();
      if (busy) return;
      if (edit.getAttribute("aria-expanded") === "true") edit.click();
      lastVia = "chip";
      const payload = {
        type: "action", action: "sample", blendId: blend.id,
        name: nameInput.value, format: format.value, address: `${company}, ${address}`,
        orderNumber: window.AtelierOrders.nextNumber(), // never a number already used
      };
      lockOffers();
      postUser("Je confirme la demande.");
      runTurn(payload);
    });
    editBrief.addEventListener("click", editBriefAction);

    body.append(f);
    openSummary = { userMsg: null, msg: msgEl, form: f };
    return confirm;
  }

  // back to step 2 (ambiance), keeping the product — same project at the end
  function editBriefAction() {
    if (busy || state.step === "done") return;
    lastVia = "chip";
    lockActive();
    lockOffers();
    postUser("Je souhaite modifier mon brief.");
    runTurn({ type: "action", action: "edit_brief" });
  }

  /* ---------------- resume: compact recap of the brief ---------------- */
  function recapCard() {
    const row = (label, key) => h("div", {}, h("dt", {}, label), h("dd", {}, fieldValue(key) || "—"));
    return h("div", { class: "recap" },
      h("dl", { class: "recap-list" },
        row("Produit", "product"), row("Ambiance", "ambiance"),
        row("Exigences", "constraints"), row("Intensité", "intensity")),
      h("button", { type: "button", class: "link-btn recap-edit", "data-offer": "", onclick: editBriefAction }, "Modifier mon brief"));
  }

  function projectFromStore(p) {
    const b = p.brief || {};
    return {
      ...freshState(),
      projectId: p.id,
      projectName: p.name,
      created: p.created || p.date,
      ...p.progressFields,
      product: p.product || null,
      target: b.target || null,
      ambiance: b.ambiance || [],
      notes: b.notes || [],
      constraints: b.constraints || [],
      intensity: b.intensity || null,
      market: b.market || null,
      volume: b.volume || null,
      launch: b.launch || null,
      potential: p.potential || null,
      blends: p.blends || [],
      favorite: p.favorite || null,
      status: p.status || null,
      source: p.source || null,
      blend: p.blend?.id || null,
      step: p.step || "reveal",
    };
  }

  function renderNotFound() {
    thread.append(h("div", { class: "notfound msg" },
      h("p", { class: "notfound-title" }, "Ce projet est introuvable."),
      h("a", { href: "mes-projets", class: "side-link" }, "Retour à Mes projets ", h("span", { "aria-hidden": "true" }, "→"))));
    announce("Ce projet est introuvable.");
    input.disabled = true;
    sendBtn.disabled = true;
  }

  function confirmationCard(c) {
    return h("div", { class: "confirm" },
      h("span", { class: "confirm-mark", "aria-hidden": "true" }, "✓"),
      h("div", { class: "confirm-text" },
        h("p", { class: "confirm-title" }, "Échantillon demandé"),
        h("p", { class: "confirm-meta" }, `N° ${c.number}`, h("span", { "aria-hidden": "true" }, " · "), h("br", { class: "confirm-br" }), c.delivery)),
      h("a", { href: "mes-projets", class: "btn btn-outline btn-small" }, "Voir dans Mes projets"));
  }
  const projectLink = () => h("a", { href: "mes-projets", class: "side-link" }, "Voir dans Mes projets ", h("span", { "aria-hidden": "true" }, "→"));

  /* ---------------- 7b · expert ---------------- */
  function chooseExpert(blend) {
    if (busy || state.step === "done") return;
    lastVia = "chip";
    lockOffers();
    postUser(blend
      ? `Je souhaite échanger avec un expert à propos de ${blend.name}.`
      : state.noMatch ? "Je souhaite transmettre mon brief à un expert."
        : "Aucun ne me convient : je souhaite échanger avec un expert.");
    runTurn({ type: "action", action: "expert", blendId: blend ? blend.id : null });
  }

  /* ---------------- save for Mes projets ---------------- */
  // a resumed project (state.projectId) is UPDATED, never duplicated
  async function persist(history, turn, id) {
    const blend = offeredBlends().find((b) => b.id === state.blend) || null;
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    pendingProjectId ||= state.projectId || crypto.randomUUID();
    const savedProject = await Store.saveProject({
      id: state.projectId || pendingProjectId,
      conversation: history,
      lastTurn: turn,
      progressFields: {
        fromProject: state.fromProject, editReturn: state.editReturn, editTopic: state.editTopic,
        format: state.format, address: state.address, orderNumber: state.orderNumber, noMatch: state.noMatch,
      },
      step: state.step,
      created: state.created || undefined,
      blends: offeredBlends(),
      favorite: state.favorite,
      expertNote: null,
      name: state.projectName || projectName(state),
      product: state.product,
      status: state.blends.length && (!state.status || state.status === "draft") ? "proposed" : state.status || "draft",
      blend: blend ? {
        id: blend.id, name: blend.name,
        notes: [blend.top, blend.heart, blend.base].map((p) => cap(String(p || "").split(",")[0].trim())).join(" · "),
      } : null,
      brief: {
        product: state.product, target: state.target, ambiance: state.ambiance, notes: state.notes, constraints: state.constraints,
        intensity: state.intensity, market: state.market, volume: state.volume, launch: state.launch,
      },
      potential: state.potential, // internal, for the sales team — never displayed
      format: state.format || null,
      orderNumber: state.orderNumber || null,
      address: state.address || null,
      contact: null,
      // how the brief was given (older saved projects have no source = chat)
      source: state.source || { type: "chat" },
    });
    if (id !== runId) return;
    if (state.step === "done" && state.status === "requested" && blend) {
      // shown in Mes commandes and in "Dernières commandes" (js/orders.js)
      const O = window.AtelierOrders;
      const address = O.defaultAddress();
      if (state.address) {
        // "Société, 12 rue de la Paix, 75002 Paris" → line + city
        const [, line, ...city] = state.address.split(",").map((x) => x.trim());
        if (line) address.line = line;
        if (city.length) address.city = city.join(", ");
      }
      O.add({
        number: state.orderNumber,
        type: "echantillon",
        reference: blend.name,
        category: state.product,
        quantity: (state.format || "Échantillon 50 ml").replace(/^Échantillon\s*/, ""),
        orderedAt: O.TODAY,
        expectedAt: O.addDays(O.TODAY, 7), // "sous 5 jours ouvrés"
        status: "preparation",
        history: [
          { date: O.TODAY, label: "Commande confirmée" },
          { date: O.TODAY, label: "En préparation — formulation de l'échantillon" },
        ],
        address,
        projectId: savedProject.id,
        projectName: savedProject.name,
      });
    }
    state.projectId = savedProject.id;
    if (!resumeId) historyReplace(savedProject.id);
  }

  function historyReplace(id) {
    history.replaceState(null, "", `creer-projet?projet=${encodeURIComponent(id)}`);
  }

  /* ================= brief import =================
     entry cards → import panel → analyzeBrief() (js/brief-import.js) →
     review card → "import_validated" turn of the engine → blends */
  const AA = window.AtelierAssistant;
  const BI = window.AtelierBriefImport;
  const LOCK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><rect x="5" y="11" width="14" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
  const ICONS = {
    project: '<svg viewBox="0 0 32 32" width="30" height="30" focusable="false"><path d="M7 9.5A2.5 2.5 0 0 1 9.5 7h5l2.5 3h5.5A2.5 2.5 0 0 1 25 12.5v10a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 7 22.5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 18.5h8m-3-3 3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chat: '<svg viewBox="0 0 32 32" width="30" height="30" focusable="false"><path d="M6 8.5A3.5 3.5 0 0 1 9.5 5h13A3.5 3.5 0 0 1 26 8.5v8a3.5 3.5 0 0 1-3.5 3.5H14l-5.5 5v-5h0A2.5 2.5 0 0 1 6 17.5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="11.5" cy="12.5" r="1" fill="currentColor"/><circle cx="16" cy="12.5" r="1" fill="currentColor"/><circle cx="20.5" cy="12.5" r="1" fill="currentColor"/></svg>',
    import: '<svg viewBox="0 0 32 32" width="30" height="30" focusable="false"><path d="M9 4h10l6 6v16.5A1.5 1.5 0 0 1 23.5 28h-14A1.5 1.5 0 0 1 8 26.5v-21A1.5 1.5 0 0 1 9 4Z M19 4v6h6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M16 23v-8m-3.5 3.5L16 15l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    drop: '<svg viewBox="0 0 40 40" width="38" height="38" focusable="false"><path d="M12 28h-1.5a6.5 6.5 0 0 1-.9-12.94A9 9 0 0 1 27 12.6 6.5 6.5 0 0 1 29.5 28H28" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M20 33V19m-5 5 5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  const ANALYSIS_STEPS = ["Lecture du document…", "Identification du produit et de la cible…", "Repérage des notes et des exigences…"];
  const REVIEW_FIELDS = [
    ["product", "Produit"], ["target", "Cible"], ["ambiance", "Ambiance"], ["notes", "Notes pressenties"],
    ["constraints", "Exigences"], ["intensity", "Intensité"], ["market", "Marché"], ["volume", "Volume annuel"], ["launch", "Lancement"],
  ];
  const REQUIRED = ["product", "market", "volume", "launch"]; // needed before proposing blends
  let entry = null;       // { wrap, turn, body } while the entry choice is open
  let importPanel = null; // the open drop zone
  let review = null;      // the open review card
  let reviewSeq = 0;      // unique ids when a document is imported again

  /* ---------------- 1 · entry choice ---------------- */
  function renderEntry(body, turn) {
    const card = (key, title, sub) => {
      const b = h("button", { type: "button", class: "entry-card", "data-entry": key, onclick: () => chooseEntry(key) },
        h("span", { class: "entry-icon", "aria-hidden": "true" }),
        h("span", { class: "entry-text" }, h("span", { class: "entry-title" }, title), h("span", { class: "entry-sub" }, sub)));
      b.querySelector(".entry-icon").innerHTML = ICONS[key];
      return b;
    };
    // returning client: "Partir d'un projet existant" · "Nouveau projet" · "Importer mon brief"
    const history = (turn.entryOptions || []).includes("project");
    const wrap = h("div", { class: history ? "entry entry--3" : "entry", role: "group", "aria-label": "Comment souhaitez-vous commencer ?" },
      history ? card("project", "Partir d'un projet existant", "Nous reprenons ses informations, vous changez ce que vous voulez.") : null,
      card("chat", history ? "Nouveau projet" : "Discuter avec l'Atelier", "Répondez à quelques questions, nous composons avec vous."),
      card("import", "Importer mon brief", "Vous avez déjà un brief ? Déposez-le, nous le lisons pour vous."));
    body.append(wrap);
    entry = { wrap, turn, body };
    return wrap.querySelector("button");
  }

  /* ---------------- "Partir d'un projet existant": pick a project ---------------- */
  function renderProjectChoices(body, list) {
    const wrap = h("div", { class: "pchoices", role: "group", "aria-label": "Vos projets" });
    list.forEach((p) => {
      const b = h("button", { type: "button", class: "pchoice", "data-project": p.id },
        h("span", { class: "pchoice-name" }, p.name),
        h("span", { class: "pchoice-meta" }, `${p.product || "Projet"} · ${window.AtelierClock.dateLabel(p.date)}`),
        p.blend ? h("span", { class: "pchoice-blend" }, `${p.blend}${p.blendFlag ? ` — ${p.blendFlag}` : ""}`) : null);
      b.addEventListener("click", () => {
        if (busy) return;
        lastVia = "chip";
        wrap.querySelectorAll("button").forEach((x) => {
          x.disabled = true;
          if (x === b) x.classList.add("is-chosen");
        });
        wrap.classList.add("is-locked");
        postUser(`Je pars de ${p.name}.`);
        runTurn({ type: "action", action: "start_from_project", projectId: p.id });
      });
      wrap.append(b);
    });
    body.append(wrap);
    return wrap.querySelector("button");
  }

  function lockEntry(key) {
    if (!entry) return null;
    entry.wrap.querySelectorAll("button").forEach((b) => {
      b.disabled = true;
      if (b.dataset.entry === key) b.classList.add("is-chosen");
    });
    entry.wrap.classList.add("is-locked");
    const e = entry;
    entry = null;
    return e;
  }

  function chooseEntry(key) {
    if (busy || !entry) return;
    lastVia = "chip";
    const e = lockEntry(key);
    const history = (e.turn.entryOptions || []).includes("project");
    if (key === "project") {
      postUser("Partir d'un projet existant");
      runTurn({ type: "action", action: "choose_project" });
    } else if (key === "chat" && history) {
      // the welcome did not ask the product question: L'Atelier asks it now
      postUser("Nouveau projet");
      state.step = "product";
      runTurn({ type: "action", action: "start_chat" });
    } else if (key === "chat") {
      // the product chips appear, as in the conversation
      const firstChip = renderChoices(e.body, e.turn);
      scrollToEl(e.body);
      firstChip.focus({ preventScroll: true });
    } else {
      postUser("Importer mon brief");
      openImport("Avec plaisir. Déposez votre brief : nous le lisons pour vous.");
    }
  }

  /* ---------------- 2 · import panel ---------------- */
  async function openImport(message) {
    const id = ++runId;
    setBusy(true);
    const typing = reduced ? null : showTyping();
    await wait(700);
    if (id !== runId) return;
    if (typing) typing.remove();
    state.step = "import";
    stageForStep("import");
    input.placeholder = DEFAULT_PLACEHOLDER;
    const { el, body } = atelierMsg(message);
    announce(message);
    importPanel = buildImportPanel();
    body.append(importPanel.root);
    scrollToEl(el);
    setBusy(false);
    if (lastVia !== "text") importPanel.pick.focus({ preventScroll: true });
  }

  function buildImportPanel() {
    const n = ++reviewSeq;
    const fileInput = h("input", { type: "file", accept: BI.ACCEPT, class: "import-input", tabindex: "-1", "aria-hidden": "true" });
    const pick = h("button", { type: "button", class: "btn btn-outline btn-small", "aria-describedby": `imp-formats-${n} imp-error-${n}` }, "Choisir un fichier");
    const zone = h("div", { class: "dropzone" },
      h("span", { class: "dropzone-icon", "aria-hidden": "true" }),
      h("p", { class: "dropzone-title" }, "Glissez votre brief ici"),
      h("p", { class: "dropzone-or", "aria-hidden": "true" }, "ou"),
      pick, fileInput);
    zone.querySelector(".dropzone-icon").innerHTML = ICONS.drop;
    const error = h("p", { class: "import-error", id: `imp-error-${n}`, "aria-live": "assertive" });
    const privacy = h("p", { class: "import-privacy" }, h("span", { class: "import-lock", "aria-hidden": "true" }), "Votre document est analysé en local et reste confidentiel.");
    privacy.querySelector(".import-lock").innerHTML = LOCK_ICON;
    const example = h("button", { type: "button", class: "link-btn" }, "Essayer avec un brief exemple");
    const back = h("button", { type: "button", class: "link-btn import-back" }, "Revenir à la discussion");
    const fileChip = h("div", { class: "import-file", hidden: true });
    const root = h("div", { class: "import" },
      zone,
      h("p", { class: "import-formats", id: `imp-formats-${n}` }, BI.FORMATS_LINE),
      error, fileChip, privacy,
      h("div", { class: "import-links" }, example, back));

    let locked = false;
    const panel = {
      root, pick,
      lock() {
        locked = true;
        root.classList.add("is-locked");
        root.querySelectorAll("button, input").forEach((c) => { c.disabled = true; });
      },
      // a document refused by the API: the message goes in the error line, the panel stays usable
      unlockWithError(message) {
        locked = false;
        root.classList.remove("is-locked");
        root.querySelectorAll("button, input").forEach((c) => { c.disabled = false; });
        fileChip.hidden = true;
        zone.classList.add("has-error");
        error.textContent = message;
      },
      clearError() {
        error.textContent = "";
        zone.classList.remove("has-error");
      },
      showFile(name, size) {
        const ext = name.split(".").pop().toUpperCase().slice(0, 4);
        fileChip.textContent = "";
        fileChip.append(h("span", { class: "doc-badge", "aria-hidden": "true" }, ext),
          h("span", { class: "import-file-name" }, name),
          h("span", { class: "import-file-size" }, BI.formatSize(size)));
        fileChip.hidden = false;
      },
    };

    function accept(file) {
      if (locked || busy || !file) return;
      const err = BI.validateFile(file);
      zone.classList.toggle("has-error", Boolean(err));
      error.textContent = err || "";
      if (err) return;
      startImport(file, panel);
    }
    pick.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => { accept(fileInput.files[0]); fileInput.value = ""; });
    zone.addEventListener("dragenter", (e) => { e.preventDefault(); if (!locked) zone.classList.add("is-dragover"); });
    zone.addEventListener("dragover", (e) => { e.preventDefault(); if (!locked) zone.classList.add("is-dragover"); });
    zone.addEventListener("dragleave", (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove("is-dragover"); });
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("is-dragover");
      accept(e.dataTransfer && e.dataTransfer.files[0]);
    });
    example.addEventListener("click", () => { if (!locked && !busy) startImport(null, panel); });
    back.addEventListener("click", () => {
      if (locked || busy) return;
      lastVia = "chip";
      panel.lock();
      postUser("Je préfère discuter.");
      state.step = "product";
      runTurn({ type: "action", action: "start_chat" });
    });
    return panel;
  }
  // a file dropped next to the zone must not replace the page
  ["dragover", "drop"].forEach((type) => window.addEventListener(type, (e) => {
    if (state && state.step === "import" && !(e.target.closest && e.target.closest(".dropzone"))) e.preventDefault();
  }));

  /* ---------------- 3 · analysis ---------------- */
  async function startImport(file, panel) {
    if (busy) return;
    lastVia = "chip";
    const ex = BI.example();
    const name = file ? file.name : ex.name;
    panel.clearError(); // an earlier refused file no longer matters
    panel.showFile(name, file ? file.size : ex.size);
    panel.lock();
    postUser(`J'importe mon brief : ${name}`);
    const id = ++runId;
    setBusy(true);
    state.step = "import-analysis";

    // composing animation with three successive steps (read aloud)
    const label = h("span", { class: "composing-label" }, ANALYSIS_STEPS[0]);
    const comp = h("div", { class: "composing composing--import", "aria-hidden": "true" });
    comp.innerHTML = `${DISCS}<span class="composing-line"></span>`;
    comp.append(label);
    const msg = h("div", { class: "msg msg--atelier" }, mono(), h("div", { class: "msg-body" }, comp));
    thread.append(msg);
    scrollToEl(msg);
    announce(ANALYSIS_STEPS[0]);

    const analysis = BI.analyzeBrief(file);
    for (const step of ANALYSIS_STEPS.slice(1)) {
      await wait(900);
      if (id !== runId) return;
      label.textContent = step;
      announce(step);
    }
    await wait(900);
    let result;
    try {
      result = await analysis;
    } catch (err) {
      result = null;
    }
    if (id !== runId) return;
    msg.remove();
    setBusy(false);
    if (result && result.error) {
      // refused by the API (scan, empty, format, size): back to the drop zone, with its message
      state.step = "import";
      panel.unlockWithError(result.error);
      announce(result.error);
      scrollToEl(panel.root);
      panel.pick.focus({ preventScroll: true });
      return;
    }
    if (!result) {
      openImport("Je n'ai pas pu lire ce document. Pouvez-vous réessayer avec un autre fichier ?");
      return;
    }
    renderReview(result);
  }

  /* ---------------- 4 · "Voici ce que nous avons compris" ---------------- */
  const hasValue = (key) => (Array.isArray(state[key]) ? state[key].length > 0 : Boolean(state[key]));
  const labelOf = (key) => (REVIEW_FIELDS.find(([k]) => k === key) || [key, key])[1];

  function updatePotential() {
    // internal lead score for the sales team — never displayed
    if (state.market && state.volume && state.launch) state.potential = AA.potentialOf(state);
  }

  function renderReview(result) {
    const n = ++reviewSeq;
    state.step = "import-review";
    state.projectName = result.projectName;
    state.source = { type: "import", fileName: result.fileName };
    const f = result.fields || {};
    // the project card fills with what was read (soft entrance)
    applyUpdates({
      product: f.product || null, target: f.target || null, ambiance: f.ambiance || [], notes: f.notes || [],
      constraints: f.constraints || [], intensity: f.intensity || null, market: f.market || null,
      volume: f.volume || null, launch: f.launch || null,
    });
    setStage(1);
    updatePotential();

    const message = "Voici ce que nous avons compris de votre brief.";
    const { el, body } = atelierMsg(message);
    const origin = {};
    REVIEW_FIELDS.forEach(([k]) => { origin[k] = (result.found || []).includes(k) ? "found" : "missing"; });

    const nameInput = h("input", { class: "summary-input", id: `rv-name-${n}`, type: "text", value: result.projectName });
    const rows = {};
    const list = h("div", { class: "review-rows" });
    REVIEW_FIELDS.forEach(([k]) => { rows[k] = h("div", { class: "review-row", "data-key": k }); list.append(rows[k]); });
    const hint = h("p", { class: "review-hint", id: `rv-hint-${n}` }, "Complétez les informations manquantes pour découvrir vos assemblages.");
    const cta = h("button", { type: "button", class: "btn btn-primary btn-small" }, "C'est bien mon projet");
    const another = h("button", { type: "button", class: "link-btn" }, "Importer un autre document");
    const card = h("div", { class: "summary review", role: "group", "aria-label": "Votre brief, tel que nous l'avons compris" },
      h("p", { class: "summary-eyebrow" }, "Votre brief"),
      h("label", { class: "sr-only", for: `rv-name-${n}` }, "Nom du projet"),
      nameInput,
      h("p", { class: "review-summary" }, result.summary),
      h("p", { class: "review-source" }, h("span", { class: "doc-badge", "aria-hidden": "true" }, result.fileName.split(".").pop().toUpperCase().slice(0, 4)), result.fileName),
      list,
      h("div", { class: "review-actions" }, cta, another),
      hint);
    body.append(card);

    // the original summary stays until a field it mentions is edited
    review = { card, rows, origin, editing: null, n, cta, hint, nameInput, summary: card.querySelector(".review-summary") };
    REVIEW_FIELDS.forEach(([k]) => renderRow(k));
    updateCta();

    const missing = REQUIRED.filter((k) => !hasValue(k)).map(labelOf);
    announce(`${message} ${(result.found || []).length} informations extraites de votre document.${missing.length ? ` À compléter : ${missing.join(", ")}.` : ""}`);
    scrollToEl(el);
    nameInput.addEventListener("change", () => { state.projectName = nameInput.value.trim() || result.projectName; });
    cta.addEventListener("click", validateImport);
    another.addEventListener("click", importAnother);
    const firstMissing = card.querySelector(".review-row.is-missing button, .review-row.is-missing input");
    (firstMissing || cta).focus({ preventScroll: true });
  }

  function displayValue(key) {
    const v = state[key];
    if (key === "notes" && Array.isArray(v) && v.length) {
      return h("ul", { class: "note-chips", role: "list" }, v.map((x) => h("li", { class: "note-chip" }, x)));
    }
    const text = fieldValue(key);
    return text ? h("span", { class: "review-value" }, text) : h("span", { class: "review-value review-empty" }, "—");
  }

  function renderRow(key) {
    const r = review;
    const row = r.rows[key];
    const label = labelOf(key);
    const labelId = `rv-${key}-${r.n}`;
    const editing = r.editing === key;
    const empty = !hasValue(key);
    const missingRequired = empty && REQUIRED.includes(key);
    const editable = key !== "notes"; // notes follow the ambiance
    row.textContent = "";
    row.classList.toggle("is-missing", missingRequired);
    row.classList.toggle("is-editing", editing);

    const main = h("div", { class: "review-main" });
    if (editing || missingRequired) main.append(editor(key, labelId, !missingRequired));
    else main.append(displayValue(key));

    const tagText = missingRequired ? "À compléter"
      : r.origin[key] === "user" ? "Précisé par vous"
      : r.origin[key] === "found" ? "Extrait de votre brief" : "Non précisé";
    const tagClass = missingRequired ? "missing" : r.origin[key] === "user" ? "user" : r.origin[key] === "found" ? "found" : "muted";
    const meta = h("div", { class: "review-meta" }, h("span", { class: `review-tag review-tag--${tagClass}` }, tagText));
    if (editable && !editing && !missingRequired) {
      meta.append(h("button", {
        type: "button", class: "link-btn review-edit", "aria-label": `Modifier : ${label}`,
        onclick: () => { r.editing = key; renderRow(key); focusRow(key); },
      }, "Modifier"));
    }
    row.append(h("span", { class: "review-label", id: labelId }, label), main, meta);
  }

  function focusRow(key) {
    const el = review.rows[key].querySelector(".review-main input, .review-main button, .review-edit");
    if (el) el.focus({ preventScroll: true });
  }

  // inline editor: text input (product, target) or the same chips as the conversation
  function editor(key, labelId, cancellable) {
    const wrap = h("div", { class: "review-editor" });
    const cancel = cancellable
      ? h("button", { type: "button", class: "link-btn review-cancel", onclick: () => { review.editing = null; renderRow(key); focusRow(key); } }, "Annuler")
      : null;
    const choices = AA.fieldChoices(key);

    if (!choices) {
      const field = h("input", { class: "review-input", type: "text", value: state[key] || "", "aria-labelledby": labelId, placeholder: key === "product" ? "Ex. : Gel douche" : "Ex. : Sportifs" });
      const ok = h("button", { type: "button", class: "btn btn-ink btn-small" }, "OK");
      const commit = () => { const v = field.value.trim(); if (v) saveField(key, v); else field.focus(); };
      ok.addEventListener("click", commit);
      field.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape" && cancel) { e.preventDefault(); cancel.click(); }
      });
      wrap.append(h("div", { class: "review-text" }, field, ok), cancel);
      return wrap;
    }

    const current = Array.isArray(state[key]) ? state[key] : state[key] ? [state[key]] : [];
    const chipsList = choices.chips.concat(current.filter((v) => !choices.chips.includes(v)));
    const group = h("div", { class: "choice-list", role: "group", "aria-labelledby": labelId });
    const picked = current.slice();
    let validate = null;
    chipsList.forEach((label) => {
      const on = current.includes(label);
      const b = h("button", {
        type: "button", class: !choices.multiple && on ? "chip choice is-current" : "chip choice", "data-value": label,
        "aria-pressed": choices.multiple ? String(on) : null,
      }, label, !choices.multiple && on ? h("span", { class: "sr-only" }, " (choix actuel)") : null);
      b.addEventListener("click", () => {
        if (!choices.multiple) { saveField(key, label); return; }
        const pressed = b.getAttribute("aria-pressed") !== "true";
        if (pressed && (label === "Aucune" || picked.includes("Aucune"))) {
          // "Aucune" cannot be combined with other requirements
          group.querySelectorAll("button").forEach((o) => o.setAttribute("aria-pressed", "false"));
          picked.length = 0;
        }
        b.setAttribute("aria-pressed", String(pressed));
        if (pressed) picked.push(label); else picked.splice(picked.indexOf(label), 1);
        validate.disabled = !picked.length;
      });
      group.append(b);
    });
    wrap.append(group);
    if (choices.multiple) {
      validate = h("button", { type: "button", class: "btn btn-ink btn-small", disabled: !picked.length, onclick: () => saveField(key, picked.slice()) }, "Valider");
      wrap.append(h("div", { class: "review-editor-foot" }, validate, cancel));
    } else if (cancel) wrap.append(h("div", { class: "review-editor-foot" }, cancel));
    return wrap;
  }

  function saveField(key, value) {
    const r = review;
    if (!r) return;
    const updates = { [key]: value };
    const changed = [key];
    if (key === "ambiance") { updates.notes = AA.notesFor(value); changed.push("notes"); r.origin.notes = "user"; }
    r.origin[key] = "user";
    r.editing = null;
    applyUpdates(updates, changed); // project card: pink "changed" highlight
    updatePotential();
    // volume / launch are not in the summary: only rewrite it for the fields it mentions
    if (["product", "target", "market", "ambiance", "notes", "constraints"].includes(key)) refreshSummary(r);
    changed.forEach((k) => {
      renderRow(k);
      const row = r.rows[k];
      row.classList.remove("is-changed");
      void row.offsetWidth;
      row.classList.add("is-changed");
    });
    updateCta();
    announce(`${labelOf(key)} : ${fieldValue(key)}.${REQUIRED.every(hasValue) ? " Votre brief est complet." : ""}`);
    // next missing information, otherwise this row's "Modifier"
    const nextMissing = r.card.querySelector(".review-row.is-missing button, .review-row.is-missing input");
    if (nextMissing) nextMissing.focus({ preventScroll: true });
    else if (REQUIRED.every(hasValue) && REQUIRED.includes(key)) r.cta.focus({ preventScroll: true });
    else focusRow(key);
  }

  // summary rewritten from the current fields, with a soft fade (not announced:
  // the field change itself already is)
  function refreshSummary(r) {
    const text = BI.buildBriefSummary(state);
    const el = r.summary;
    if (!el || el.textContent === text) return;
    if (reduced) { el.textContent = text; return; }
    el.classList.add("is-fading");
    setTimeout(() => {
      el.textContent = text;
      el.classList.remove("is-fading");
    }, 280);
  }

  function updateCta() {
    const complete = REQUIRED.every(hasValue);
    review.cta.disabled = !complete;
    review.hint.hidden = complete;
    if (complete) review.cta.removeAttribute("aria-describedby");
    else review.cta.setAttribute("aria-describedby", review.hint.id);
  }

  function lockReview() {
    if (!review) return;
    review.card.classList.add("is-locked");
    review.card.querySelectorAll("button, input").forEach((c) => { c.disabled = true; });
  }

  /* ---------------- 5 · validation → blends ---------------- */
  function validateImport() {
    if (busy || !review || !REQUIRED.every(hasValue)) return;
    lastVia = "chip";
    state.projectName = review.nameInput.value.trim() || state.projectName;
    lockReview();
    review = null;
    postUser("C'est bien mon projet.");
    const fields = {};
    FIELDS.forEach((k) => { fields[k] = state[k]; });
    runTurn({ type: "action", action: "import_validated", fields, projectName: state.projectName });
  }

  function importAnother() {
    if (busy || !review) return;
    lastVia = "chip";
    lockReview();
    review = null;
    postUser("J'importe un autre document.");
    // the previous values are discarded
    applyUpdates({ product: null, target: null, ambiance: [], notes: [], constraints: [], intensity: null, market: null, volume: null, launch: null });
    state.projectName = null;
    state.source = null;
    state.potential = null;
    setStage(0);
    openImport("Bien sûr. Déposez votre nouveau document.");
  }

  /* ---------------- free text ---------------- */
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;
    lastVia = "text";
    input.value = "";
    // typing at the start (or on the import panel) = choosing the conversation
    if (entry) lockEntry("chat");
    // a project name typed instead of picked: the picker is closed
    thread.querySelectorAll(".pchoices:not(.is-locked)").forEach((w) => {
      w.classList.add("is-locked");
      w.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    });
    if (state.step === "import") {
      if (importPanel) importPanel.lock();
      state.step = "product";
    }
    if (state.step === "import-review") {
      postUser(text);
      const hint = "Pour poursuivre, complétez ou corrigez la fiche ci-dessus, puis cliquez sur « C'est bien mon projet ».";
      atelierMsg(hint);
      announce(hint);
      scrollToEl(thread.lastElementChild);
      return;
    }
    lockActive();
    postUser(text);
    // project finished: the message goes to the sales rep, never to the engine
    if (state.step === "done") {
      answerAfterEnd(text);
      return;
    }
    runTurn({ type: "text", text });
  });

  /* ---------------- after the end: messages go to the sales rep ---------------- */
  // simple keyword check: does the message look like a change to the brief?
  async function answerAfterEnd(text) {
    const id = runId;
    setBusy(true);
    try {
      await AtelierData.send(state.projectId, text);
      if (id !== runId) return;
      const { el, body } = atelierMsg("Votre message a été envoyé.");
      body.append(h("a", { href: `messages?projet=${encodeURIComponent(state.projectId)}`, class: "side-link" }, "Ouvrir la conversation →"));
      scrollToEl(el);
    } catch (error) {
      if (id !== runId) return;
      input.value = text;
      atelierMsg("Impossible d’envoyer ce message. Vous pouvez réessayer.");
    } finally {
      if (id === runId) setBusy(false);
    }
  }

  /* ---------------- start / restart ---------------- */
  function start() {
    runId++;
    setBusy(false);
    thread.textContent = "";
    activeChoices = null;
    openSummary = null;
    entry = null;
    importPanel = null;
    review = null;
    pendingProjectId = null;
    transcript = [];
    input.disabled = false;
    input.value = "";
    state = freshState();
    refreshPencils();

    if (resumeId) {
      const project = Store.find(resumeId);
      if (!project) {
        FIELDS.forEach((k) => renderField(k, false));
        updateCount();
        setStage(-1, -1);
        renderNotFound();
        return;
      }
      // the card is filled right away, then L'Atelier greets with a recap
      state = projectFromStore(project);
      FIELDS.forEach((k) => renderField(k, false));
      updateCount();
      transcript = project.conversation || [];
      stageForStep(state.step);
      if (project.lastTurn && state.step !== "import") {
        const log = h("details", { class: "msg" }, h("summary", {}, "Historique de la conversation"));
        transcript.forEach(({ input, reply }) => {
          const label = input.text || (Array.isArray(input.values) ? input.values.join(", ") : Object.values(input.values || {}).filter(Boolean).join(", "));
          if (label) log.append(h("p", {}, label));
          log.append(h("p", {}, plain(reply)));
        });
        thread.append(log);
        renderTurn(project.lastTurn, runId).catch(AtelierData.report);
      } else if (state.step === "import") {
        state.step = null;
        runTurn(null);
      } else runTurn({ type: "action", action: "resume" });
      return;
    }

    FIELDS.forEach((k) => renderField(k, false));
    countEl.textContent = "· 0 élément";
    setStage(0);
    runTurn(null);
  }

  // "Recommencer" always starts a brand-new project (no project id)
  $("#restart").addEventListener("click", () => {
    lastVia = "chip";
    resumeId = null;
    history.replaceState(null, "", "creer-projet");
    start();
  });

  start();
})();
