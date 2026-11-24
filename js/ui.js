/* =========================================================
   Givaudan Atelier — header menu, sign-in modal, explore filters
   ========================================================= */
(() => {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.getElementById("site-nav");
  const mobileQuery = window.matchMedia("(max-width: 760px)");

  const pauseScroll = () => window.atelierLenis && window.atelierLenis.stop();
  const resumeScroll = () => window.atelierLenis && window.atelierLenis.start();

  /* ---------------- Mobile menu ---------------- */
  function setMenu(open, { focusToggle = false } = {}) {
    header.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
    if (open) {
      const first = nav.querySelector("a");
      if (first) setTimeout(() => first.focus(), 50);
    } else if (focusToggle) {
      toggle.focus();
    }
  }
  toggle.addEventListener("click", () => setMenu(!header.classList.contains("menu-open")));
  document.addEventListener("click", (e) => {
    if (header.classList.contains("menu-open") && !header.contains(e.target)) setMenu(false);
  });
  mobileQuery.addEventListener("change", () => setMenu(false));

  /* ---------------- Sign-in modal ---------------- */
  const modal = document.getElementById("auth-modal");
  const dialog = modal ? modal.querySelector(".modal-dialog") : null;
  let lastFocus = null;
  let closeTimer = 0;

  const focusables = () =>
    Array.from(dialog.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));

  function openModal(trigger) {
    clearTimeout(closeTimer);
    lastFocus = trigger || document.activeElement;
    // the login page will send the user back to the action they chose
    const next = trigger && trigger.dataset.authNext;
    const query = next ? `?next=${encodeURIComponent(next)}` : "";
    modal.querySelector("[data-auth-login]").setAttribute("href", `connexion${query}#connexion`);
    modal.querySelector("[data-auth-signup]").setAttribute("href", `connexion${query}#inscription`);
    // also kept in sessionStorage, in case a server drops the query string
    if (window.AtelierSession) {
      window.AtelierSession.rememberNext(next);
      // "Recommander une référence" → open the reorder modal once on Mes commandes
      window.AtelierSession.rememberIntent(trigger && trigger.dataset.authIntent);
    }
    setMenu(false);
    modal.hidden = false;
    document.body.classList.add("modal-open");
    pauseScroll();
    // next frame so the opening transition runs
    requestAnimationFrame(() => {
      modal.classList.add("is-open");
      const primary = dialog.querySelector(".btn-primary");
      (primary || dialog).focus();
    });
  }

  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.classList.remove("is-open");
    document.body.classList.remove("modal-open");
    resumeScroll();
    closeTimer = setTimeout(() => { modal.hidden = true; }, reduced ? 0 : 600);
    if (lastFocus && document.contains(lastFocus)) {
      // a link inside the closed mobile menu cannot take focus: fall back to the toggle
      const visible = lastFocus.offsetParent !== null && getComputedStyle(lastFocus).visibility !== "hidden";
      (visible ? lastFocus : toggle).focus();
    }
  }

  // pages without the modal (e.g. connexion) simply follow the link
  if (modal) {
    document.querySelectorAll("[data-auth-next]").forEach((el) => {
      el.addEventListener("click", (e) => {
        // logged in (simulated): the link already points to its page
        if (window.AtelierSession && window.AtelierSession.isLoggedIn()) return;
        e.preventDefault();
        openModal(el);
      });
    });
    modal.querySelectorAll("[data-modal-close]").forEach((el) => el.addEventListener("click", closeModal));
  }
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (modal && !modal.hidden) closeModal();
      else if (header.classList.contains("menu-open")) setMenu(false, { focusToggle: true });
      return;
    }
    // keep keyboard focus inside the open modal
    if (e.key === "Tab" && modal && !modal.hidden) {
      const items = focusables();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  /* ---------------- Explore filters ---------------- */
  const chips = Array.from(document.querySelectorAll(".explore .chip"));
  const cards = Array.from(document.querySelectorAll(".explore .card"));
  const status = document.getElementById("explore-status");
  const FADE = reduced ? 0 : 380;
  let filterTimer = 0;

  function applyFilter(key, label) {
    chips.forEach((c) => {
      const on = c.dataset.filter === key;
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-pressed", String(on));
    });

    const match = (card) => key === "all" || card.dataset.family === key;
    // 1. fade out the cards that leave
    cards.forEach((card) => {
      if (!match(card)) card.classList.add("is-filtered-out");
    });
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      // 2. remove them from the grid, bring the matching ones back in softly
      cards.forEach((card) => {
        if (match(card)) {
          const wasGone = card.classList.contains("is-gone");
          card.classList.remove("is-gone");
          card.classList.add("is-visible"); // in case the reveal had not fired yet
          if (wasGone) {
            card.classList.add("is-filtered-out");
            requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove("is-filtered-out")));
          } else {
            card.classList.remove("is-filtered-out");
          }
        } else {
          card.classList.add("is-gone");
        }
      });
      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    }, FADE);

    const count = cards.filter(match).length;
    status.textContent =
      key === "all" ? `${count} assemblages affichés` : `${count} assemblage${count > 1 ? "s" : ""} : ${label}`;
  }

  chips.forEach((chip) => {
    chip.addEventListener("click", () => applyFilter(chip.dataset.filter, chip.textContent.trim()));
  });
})();
