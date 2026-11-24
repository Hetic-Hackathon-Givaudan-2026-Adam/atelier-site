/* =========================================================
   Givaudan Atelier — dedicated contact card (Mes projets, Messages)
   "Contacter" is a link to /messages; "Prendre rendez-vous" opens
   3 slots inside the card (simulated) → toast.
   Also keeps --header-h up to date for the sticky side cards.
   ========================================================= */
(() => {
  "use strict";

  const header = document.querySelector(".site-header");
  if (header) {
    const setHeaderH = () => document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`);
    setHeaderH();
    window.addEventListener("resize", setHeaderH);
    // the header grows once the fonts load and the avatar menu replaces "Se connecter"
    if (window.ResizeObserver) new ResizeObserver(setHeaderH).observe(header);
  }

  const toastEl = document.getElementById("toast");
  let toastTimer = 0;
  function toast(text) {
    if (!toastEl) return;
    clearTimeout(toastTimer);
    toastEl.textContent = text;
    toastEl.classList.add("is-visible");
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2800);
  }

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const SLOTS = [
    ["Mar. 24 nov. · 10 h", "mardi 24 novembre à 10 h"],
    ["Mer. 25 nov. · 14 h 30", "mercredi 25 novembre à 14 h 30"],
    ["Jeu. 26 nov. · 11 h", "jeudi 26 novembre à 11 h"],
  ];

  document.querySelectorAll("[data-contact]").forEach((cardEl) => {
    const btn = cardEl.querySelector('[data-contact-open="meeting"]');
    const panel = cardEl.querySelector(".contact-panel");
    if (!btn || !panel) return;
    const uid = cardEl.dataset.contact;

    function close(focusBack = true) {
      panel.hidden = true;
      panel.textContent = "";
      btn.setAttribute("aria-expanded", "false");
      if (focusBack) btn.focus({ preventScroll: true });
    }
    function open() {
      panel.textContent = "";
      btn.setAttribute("aria-expanded", "true");
      const legend = el("p", "contact-label", "Choisissez un créneau");
      legend.id = `contact-slots-${uid}`;
      const group = el("div", "chips contact-slots");
      group.setAttribute("role", "group");
      group.setAttribute("aria-labelledby", legend.id);
      let picked = null;
      const confirm = el("button", "btn btn-primary btn-small", "Confirmer");
      confirm.type = "button";
      confirm.disabled = true;
      SLOTS.forEach(([short, long]) => {
        const chip = el("button", "chip contact-slot", short);
        chip.type = "button";
        chip.setAttribute("aria-pressed", "false");
        chip.addEventListener("click", () => {
          picked = long;
          group.querySelectorAll("button").forEach((c) => {
            c.setAttribute("aria-pressed", String(c === chip));
            c.classList.toggle("is-active", c === chip);
          });
          confirm.disabled = false;
        });
        group.append(chip);
      });
      confirm.addEventListener("click", () => {
        if (!picked) return;
        close();
        toast(`Rendez-vous confirmé avec Claire Martin le ${picked}.`);
      });
      const cancel = el("button", "link-btn contact-cancel", "Annuler");
      cancel.type = "button";
      cancel.addEventListener("click", () => close());
      const actions = el("div", "contact-form-actions");
      actions.append(confirm, cancel);
      panel.append(legend, group, actions);
      panel.hidden = false;
      group.querySelector("button").focus();
    }

    btn.addEventListener("click", () => (panel.hidden ? open() : close()));
    panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    });
  });
})();
