/* =========================================================
   Givaudan Atelier — connexion / inscription (front-end prototype)
   No data is sent anywhere.
   ========================================================= */
(() => {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SWITCH = reduced ? 0 : 420;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const views = {
    login: document.getElementById("view-login"),
    signup: document.getElementById("view-signup"),
    success: document.getElementById("view-success"),
  };
  const TITLES = {
    login: "Connexion — Givaudan Atelier",
    signup: "Créer un compte — Givaudan Atelier",
    success: "Bienvenue — Givaudan Atelier",
  };
  let current = null;
  let switching = null;

  /* ---------------- Header: solid once the page scrolls ---------------- */
  const header = document.querySelector(".site-header");
  const updateHeader = () => header.classList.toggle("is-solid", window.scrollY > 8);
  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();

  /* ---------------- Mode switching ---------------- */
  const modeFromHash = () => (location.hash === "#inscription" ? "signup" : "login");

  function show(name, { focus = true, animate = true } = {}) {
    if (name === current) return;
    const from = current ? views[current] : null;
    const to = views[name];
    current = name;
    document.title = TITLES[name];
    clearTimeout(switching);

    const enter = () => {
      Object.values(views).forEach((v) => { if (v !== to) { v.hidden = true; v.classList.remove("is-leaving", "is-entering"); } });
      to.hidden = false;
      if (animate && !reduced) {
        to.classList.add("is-entering");
        requestAnimationFrame(() => requestAnimationFrame(() => to.classList.remove("is-entering")));
      }
      if (focus) {
        const title = to.querySelector(".auth-title");
        if (title) title.focus({ preventScroll: true });
        // bring the top of the form into view (useful on mobile)
        const card = document.querySelector(".auth-card");
        const top = card.getBoundingClientRect().top + window.scrollY - 100;
        if (window.scrollY > top) window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
      }
    };

    if (from && animate && !reduced) {
      from.classList.add("is-leaving");
      switching = setTimeout(enter, SWITCH);
    } else {
      enter();
    }
  }

  window.addEventListener("hashchange", () => show(modeFromHash()));
  // a link to the hash we are already on (e.g. after the success view) still switches the view
  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href="#connexion"], a[href="#inscription"]');
    if (link && link.getAttribute("href") === (location.hash || "#connexion")) {
      e.preventDefault();
      show(link.getAttribute("href") === "#inscription" ? "signup" : "login");
    }
  });
  show(modeFromHash(), { focus: false, animate: false });

  /* ---------------- Password visibility ---------------- */
  document.querySelectorAll(".password-toggle").forEach((btn) => {
    const input = document.getElementById(btn.getAttribute("aria-controls"));
    btn.addEventListener("click", () => {
      const visible = input.type === "password";
      input.type = visible ? "text" : "password";
      btn.setAttribute("aria-pressed", String(visible));
      btn.setAttribute("aria-label", visible ? "Masquer le mot de passe" : "Afficher le mot de passe");
    });
  });

  /* ---------------- "Déjà client" reveal ---------------- */
  const clientBox = document.getElementById("su-client");
  const clientExtra = document.getElementById("su-client-extra");
  let collapseTimer = 0;
  clientBox.addEventListener("change", () => {
    const open = clientBox.checked;
    clientBox.setAttribute("aria-expanded", String(open));
    clearTimeout(collapseTimer);
    if (open) {
      clientExtra.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => clientExtra.classList.add("is-open")));
    } else {
      clientExtra.classList.remove("is-open");
      collapseTimer = setTimeout(() => { clientExtra.hidden = true; }, reduced ? 0 : 600);
    }
  });

  /* ---------------- Validation ---------------- */
  function messageFor(input, mode) {
    const v = input.type === "checkbox" ? input.checked : input.value.trim();
    if (input.type === "checkbox") {
      return v ? "" : "Merci d'accepter le traitement de vos données pour créer votre compte.";
    }
    if (input.required && !v) return `Veuillez renseigner ${input.dataset.label}.`;
    if (input.type === "email" && !EMAIL_RE.test(v)) {
      return "Veuillez saisir une adresse email valide, par exemple prenom.nom@entreprise.com.";
    }
    if (input.name === "password" && mode === "signup" && input.value.length < 8) {
      return "Votre mot de passe doit contenir au moins 8 caractères.";
    }
    return "";
  }

  function setError(input, message) {
    const field = input.closest(".field-check") || input.closest(".field");
    const error = document.getElementById(`${input.id}-error`);
    if (!error) return;
    error.textContent = message;
    field.classList.toggle("has-error", Boolean(message));
    // link the message to the field for assistive technologies
    const ids = (input.getAttribute("aria-describedby") || "").split(" ").filter((id) => id && id !== error.id);
    if (message) {
      ids.unshift(error.id);
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
    if (ids.length) input.setAttribute("aria-describedby", ids.join(" "));
    else input.removeAttribute("aria-describedby");
  }

  function setupForm(form, mode) {
    const inputs = Array.from(form.querySelectorAll("input[required], select[required]"));
    let submitted = false;

    // after a first attempt, errors update as the user types
    inputs.forEach((input) => {
      const evt = input.type === "checkbox" || input.tagName === "SELECT" ? "change" : "input";
      input.addEventListener(evt, () => {
        if (submitted || input.getAttribute("aria-invalid") === "true") setError(input, messageFor(input, mode));
      });
      input.addEventListener("blur", () => {
        if (submitted && input.type !== "checkbox") setError(input, messageFor(input, mode));
      });
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submitted = true;
      let firstInvalid = null;
      inputs.forEach((input) => {
        const msg = messageFor(input, mode);
        setError(input, msg);
        if (msg && !firstInvalid) firstInvalid = input;
      });
      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }

      // valid: short, calm loading state, then the success view (nothing is sent)
      const button = form.querySelector('[type="submit"]');
      button.classList.add("is-loading");
      button.setAttribute("aria-busy", "true");
      setTimeout(() => {
        button.classList.remove("is-loading");
        button.removeAttribute("aria-busy");
        const firstName = form.querySelector('[name="firstname"]');
        const lastName = form.querySelector('[name="lastname"]');
        const email = form.querySelector('[name="email"]');

        // simulated login (localStorage) and post-login destination
        const S = window.AtelierSession;
        const next = S ? S.consumeNext() : "mes-projets";
        if (S) {
          if (mode === "signup") {
            const company = form.querySelector('[name="company"]');
            S.login({ firstName: firstName.value, lastName: lastName.value, company: company ? company.value : "", email: email ? email.value : "", existingClient: clientBox.checked });
          } else {
            S.login({ firstName: "Mira", lastName: "Koné", company: "Maison Koné", email: email ? email.value : "", existingClient: true });
          }
        }
        document.getElementById("success-cta").setAttribute("href", next);
        setTimeout(() => { location.href = next; }, reduced ? 1200 : 2000);

        document.getElementById("success-title").innerHTML =
          mode === "signup" ? "Bienvenue dans l'<em>Atelier</em>." : "Connexion <em>réussie</em>.";
        document.getElementById("success-text").textContent =
          mode === "signup"
            ? `Merci${firstName && firstName.value.trim() ? " " + firstName.value.trim() : ""}, votre compte est prêt. Vous pouvez dès maintenant créer votre premier projet.`
            : "Ravi de vous revoir. Votre espace vous attend.";
        form.reset();
        if (mode === "signup") {
          clientExtra.classList.remove("is-open");
          clientExtra.hidden = true;
          clientBox.setAttribute("aria-expanded", "false");
        }
        submitted = false;
        show("success");
      }, reduced ? 200 : 900);
    });
  }

  setupForm(document.getElementById("form-login"), "login");
  setupForm(document.getElementById("form-signup"), "signup");
})();
