/* Formulaires de connexion et d’inscription Supabase. */
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
  const updateHeader = () =>
    header.classList.toggle("is-solid", window.scrollY > 8);
  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();

  /* ---------------- Mode switching ---------------- */
  const modeFromHash = () =>
    location.hash === "#inscription" ? "signup" : "login";

  function show(name, { focus = true, animate = true } = {}) {
    if (name === current) return;
    const from = current ? views[current] : null;
    const to = views[name];
    current = name;
    document.title = TITLES[name];
    clearTimeout(switching);

    const enter = () => {
      Object.values(views).forEach((v) => {
        if (v !== to) {
          v.hidden = true;
          v.classList.remove("is-leaving", "is-entering");
        }
      });
      to.hidden = false;
      if (animate && !reduced) {
        to.classList.add("is-entering");
        requestAnimationFrame(() =>
          requestAnimationFrame(() => to.classList.remove("is-entering")),
        );
      }
      if (focus) {
        const title = to.querySelector(".auth-title");
        if (title) title.focus({ preventScroll: true });
        // bring the top of the form into view (useful on mobile)
        const card = document.querySelector(".auth-card");
        const top = card.getBoundingClientRect().top + window.scrollY - 100;
        if (window.scrollY > top)
          window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
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
    const link = e.target.closest(
      'a[href="#connexion"], a[href="#inscription"]',
    );
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
      btn.setAttribute(
        "aria-label",
        visible ? "Masquer le mot de passe" : "Afficher le mot de passe",
      );
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
      requestAnimationFrame(() =>
        requestAnimationFrame(() => clientExtra.classList.add("is-open")),
      );
    } else {
      clientExtra.classList.remove("is-open");
      collapseTimer = setTimeout(
        () => {
          clientExtra.hidden = true;
        },
        reduced ? 0 : 600,
      );
    }
  });

  /* ---------------- Validation ---------------- */
  function messageFor(input, mode) {
    const v = input.type === "checkbox" ? input.checked : input.value.trim();
    if (input.type === "checkbox") {
      return v
        ? ""
        : "Merci d'accepter le traitement de vos données pour créer votre compte.";
    }
    if (input.required && !v)
      return `Veuillez renseigner ${input.dataset.label}.`;
    if (input.type === "email" && !EMAIL_RE.test(v)) {
      return "Veuillez saisir une adresse email valide, par exemple prenom.nom@entreprise.com.";
    }
    if (
      input.name === "password" &&
      mode === "signup" &&
      input.value.length < 8
    ) {
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
    const ids = (input.getAttribute("aria-describedby") || "")
      .split(" ")
      .filter((id) => id && id !== error.id);
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
    const inputs = Array.from(
      form.querySelectorAll("input[required], select[required]"),
    );
    let submitted = false;

    // after a first attempt, errors update as the user types
    inputs.forEach((input) => {
      const evt =
        input.type === "checkbox" || input.tagName === "SELECT"
          ? "change"
          : "input";
      input.addEventListener(evt, () => {
        if (submitted || input.getAttribute("aria-invalid") === "true")
          setError(input, messageFor(input, mode));
      });
      input.addEventListener("blur", () => {
        if (submitted && input.type !== "checkbox")
          setError(input, messageFor(input, mode));
      });
    });

    form.addEventListener("submit", async (e) => {
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

      const button = form.querySelector('[type="submit"]');

      if (button.disabled) return;

      button.disabled = true;
      button.classList.add("is-loading");
      button.setAttribute("aria-busy", "true");

      try {
        if (!supabaseClient) throw new Error("La connexion Supabase doit être configurée.");
        await AtelierSession.ready;
        const email = form.querySelector('[name="email"]').value.trim();
        const password = form.querySelector('[name="password"]').value;

        const firstName = form.querySelector('[name="firstname"]');
        const lastName = form.querySelector('[name="lastname"]');
        const company = form.querySelector('[name="company"]');
        const country = form.querySelector('[name="country"]');

        let result;

        if (mode === "signup") {
          result = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: location.origin + "/connexion",
              data: {
                full_name: `${firstName.value.trim()} ${lastName.value.trim()}`,
                first_name: firstName.value.trim(),
                last_name: lastName.value.trim(),
                company: company.value.trim(),
                country: country.value,
                existing_client_claim: clientBox.checked,
              },
            },
          });
        } else {
          result = await supabaseClient.auth.signInWithPassword({
            email,
            password,
          });
        }

        if (result.error) {
          throw result.error;
        }

        // Inscription nécessitant une confirmation par email
        if (mode === "signup" && !result.data.session) {
          document.getElementById("success-title").textContent =
            "Vérifiez votre adresse email";

          document.getElementById("success-text").textContent =
            "Si votre inscription est acceptée, vous recevrez un lien de confirmation par email.";

          document
            .getElementById("success-cta")
            .setAttribute("href", "#connexion");

          document.getElementById("success-cta").textContent =
            "Retour à la connexion";

          document.getElementById("success-note").textContent = "";

          form.reset();
          show("success");

          return;
        }

        const user = result.data.user;

        if (!user || !result.data.session) {
          throw new Error("Aucune session active.");
        }

        const S = window.AtelierSession;
        const session = await S.login();
        if (!session) throw new Error("Impossible de charger votre profil Supabase.");
        const next = S.destination(session, S.consumeNext());

        document.getElementById("success-cta").setAttribute("href", next);

        document.getElementById("success-cta").textContent =
          "Accéder à mon espace";

        document.getElementById("success-title").textContent =
          mode === "signup"
            ? "Bienvenue dans l'Atelier."
            : "Connexion réussie.";

        document.getElementById("success-text").textContent =
          "Votre espace vous attend.";

        document.getElementById("success-note").textContent =
          "Redirection vers votre espace…";

        form.reset();
        submitted = false;

        show("success");

        setTimeout(
          () => {
            location.href = next;
          },
          reduced ? 1200 : 2000,
        );
      } catch (error) {
        console.error("Erreur Supabase :", error.message);

        alert("Impossible de poursuivre : " + error.message);
      } finally {
        button.disabled = false;
        button.classList.remove("is-loading");
        button.removeAttribute("aria-busy");
      }
    });
  }

  setupForm(document.getElementById("form-login"), "login");
  setupForm(document.getElementById("form-signup"), "signup");
})();
