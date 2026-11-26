/* =========================================================
   Givaudan Atelier — simulated login state (front-end prototype)
   Stored in localStorage only. Loaded in <head> on every page so that
   protected pages (<html data-protected>) redirect before rendering.
   ========================================================= */
(() => {
  "use strict";

  const KEY = "givaudanAtelier.session";
  const NEXT_KEY = "atelierNext"; // destination kept in sessionStorage across the login page
  const REORDER_KEY = "atelierOpenReorder"; // "1" → open the reorder modal on Mes commandes
  const DELETED_KEY = "atelierAccountDeleted"; // "1" → "Votre compte a été supprimé." on the next page
  // only these pages are accepted as a post-login destination (no open redirect)
  const NEXT_PAGES = ["mes-projets", "commandes", "creer-projet", "messages", "profil"];
  const DEFAULT_NEXT = "mes-projets";

  // "creer-projet", "/creer-projet", "creer-projet.html" → "creer-projet"; anything else → null
  const normalizeNext = (value) => {
    if (typeof value !== "string") return null;
    const v = value.trim().replace(/^\.?\//, "").replace(/\.html$/, "");
    return NEXT_PAGES.includes(v) ? v : null;
  };

  const read = () => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      return s && typeof s.firstName === "string" ? s : null;
    } catch (_) {
      return null;
    }
  };
  const write = (s) => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { /* storage blocked */ }
  };

  const api = {
    get: read,
    isLoggedIn: () => Boolean(read()),
    login({ firstName, lastName, company, email, existingClient } = {}) {
      const s = {
        firstName: (firstName || "").trim() || "Mira",
        lastName: (lastName || "").trim() || "Koné",
        company: (company || "").trim() || "Maison Koné",
        email: (email || "").trim(), // optional ("" → "Non renseigné" in Mon profil)
        existingClient: Boolean(existingClient),
        since: Date.now(),
      };
      write(s);
      return s;
    },
    // update some fields (Mon profil), then repaint the account menu of this page
    update(patch) {
      const s = read();
      if (!s) return null;
      Object.assign(s, patch);
      write(s);
      paintAccount(s);
      return s;
    },
    // Mon profil → "Supprimer mon compte": message shown once on the next page
    flagDeleted() {
      try { sessionStorage.setItem(DELETED_KEY, "1"); } catch (_) { /* storage blocked */ }
    },
    logout() {
      try { localStorage.removeItem(KEY); } catch (_) { /* ignore */ }
    },
    safeNext(value) {
      return normalizeNext(value) || DEFAULT_NEXT;
    },
    // remember where the user wanted to go before sending them to the login page
    rememberNext(value) {
      const v = normalizeNext(value);
      try {
        if (v) sessionStorage.setItem(NEXT_KEY, v);
        else sessionStorage.removeItem(NEXT_KEY);
      } catch (_) { /* storage blocked */ }
    },
    // what to do once there (data-auth-intent="reorder" → open the reorder modal on
    // Mes commandes). sessionStorage, because `serve` may drop the query/hash.
    rememberIntent(intent) {
      try {
        if (intent === "reorder") sessionStorage.setItem(REORDER_KEY, "1");
        else sessionStorage.removeItem(REORDER_KEY);
      } catch (_) { /* storage blocked */ }
    },
    // after login: URL parameter first, then sessionStorage, otherwise Mes projets — then clear
    consumeNext() {
      let stored = null;
      try {
        stored = sessionStorage.getItem(NEXT_KEY);
        sessionStorage.removeItem(NEXT_KEY);
      } catch (_) { /* storage blocked */ }
      const param = new URLSearchParams(location.search).get("next");
      return normalizeNext(param) || normalizeNext(stored) || DEFAULT_NEXT;
    },
    // unread messages badge in the header (js/messages-store.js)
    renderMessagesBadge() {
      const link = document.querySelector(".nav-messages");
      if (!link || !window.AtelierMessages) return;
      const n = window.AtelierMessages.unreadCount();
      const badge = link.querySelector(".nav-badge");
      badge.textContent = String(n);
      badge.hidden = n === 0;
      link.setAttribute("aria-label", n ? `Messages, ${n} non lu${n > 1 ? "s" : ""}` : "Messages");
    },
    initials(s) {
      return ((s.firstName[0] || "") + (s.lastName[0] || "")).toUpperCase();
    },
  };
  window.AtelierSession = api;

  /* ---------------- Guard for customer-space pages ---------------- */
  if (document.documentElement.hasAttribute("data-protected") && !read()) {
    const page = api.safeNext(location.pathname.split("/").pop());
    api.rememberNext(page);
    location.replace(`connexion?next=${encodeURIComponent(page)}`);
    return;
  }

  /* ---------------- Header ---------------- */
  // initials, name and status of the account menu (again after AtelierSession.update)
  function paintAccount(s) {
    const account = document.querySelector(".site-header .account");
    if (!account || !s) return;
    const name = `${s.firstName} ${s.lastName}`;
    account.querySelectorAll(".avatar-initials").forEach((el) => { el.textContent = api.initials(s); });
    account.querySelector(".avatar-btn .sr-only").textContent = `Mon compte : ${name}`;
    account.querySelector(".account-name").textContent = name;
    account.querySelector(".account-status").textContent = s.existingClient ? "Client Givaudan" : "Nouveau client";
  }

  // after "Supprimer mon compte": a short message on the home page (self-styled,
  // since the home page has no toast of its own)
  function showDeletedNotice() {
    let flagged = false;
    try {
      flagged = sessionStorage.getItem(DELETED_KEY) === "1";
      sessionStorage.removeItem(DELETED_KEY);
    } catch (_) { /* storage blocked */ }
    if (!flagged) return;
    const note = document.createElement("p");
    note.setAttribute("role", "status");
    note.textContent = "Votre compte a été supprimé.";
    note.style.cssText = "position:fixed;left:50%;bottom:28px;z-index:200;margin:0;padding:12px 22px;transform:translateX(-50%);"
      + "background:#f7f6f3;color:#141414;border:1px solid rgba(20,20,20,.1);border-radius:999px;"
      + "box-shadow:0 22px 48px -26px rgba(20,20,20,.4);font-family:var(--font-display,serif);font-size:1.05rem;"
      + "white-space:nowrap;transition:opacity .5s ease;";
    document.body.append(note);
    setTimeout(() => { note.style.opacity = "0"; }, 3600);
    setTimeout(() => note.remove(), 4200);
  }

  function renderHeader() {
    showDeletedNotice();
    const s = read();
    const hasModal = Boolean(document.getElementById("auth-modal"));

    // actions that need an account: direct link when logged in, otherwise the
    // login modal (landing page) or the login page with the right "next"
    document.querySelectorAll("[data-auth-next]").forEach((el) => {
      const next = el.dataset.authNext;
      const hash = el.dataset.authHash ? `#${el.dataset.authHash}` : ""; // e.g. commandes#recommander
      if (s) el.setAttribute("href", next + hash);
      else if (!hasModal) el.setAttribute("href", `connexion?next=${encodeURIComponent(next)}#connexion`);
      // logged out, no modal on this page: keep the destination (and intent) for after login
      if (!s && !hasModal) {
        el.addEventListener("click", () => {
          api.rememberNext(next);
          api.rememberIntent(el.dataset.authIntent);
        });
      }
    });
    // a plain "Se connecter" has no destination: forget any older one
    document.querySelectorAll("[data-signin]").forEach((el) => {
      el.addEventListener("click", () => {
        api.rememberNext(null);
        api.rememberIntent(null);
      });
    });

    if (!s) return;
    const nav = document.getElementById("site-nav");
    const signIn = nav && nav.querySelector("[data-signin]");
    if (!signIn) return;

    // "Messages" between "Mes commandes" and the avatar, with the unread badge
    if (!nav.querySelector(".nav-messages")) {
      const link = document.createElement("a");
      link.href = "messages";
      link.className = "nav-link nav-messages";
      link.innerHTML = 'Messages<span class="nav-badge" hidden></span>';
      if (/\/messages$/.test(location.pathname)) link.setAttribute("aria-current", "page");
      signIn.before(link);
      api.renderMessagesBadge();
    }

    const account = document.createElement("div");
    account.className = "account";
    account.innerHTML = `
      <button type="button" class="avatar-btn" aria-expanded="false" aria-controls="account-menu">
        <span class="avatar-initials" aria-hidden="true"></span>
        <span class="sr-only"></span>
      </button>
      <div class="account-menu" id="account-menu" hidden>
        <div class="account-id">
          <span class="avatar-initials avatar-initials--static" aria-hidden="true"></span>
          <span class="account-id-text">
            <span class="account-name"></span>
            <span class="account-status"></span>
          </span>
        </div>
        <a href="profil" class="account-item">Mon profil</a>
        <button type="button" class="account-item" data-logout>Se déconnecter</button>
      </div>`;
    if (/\/profil(\.html)?$/.test(location.pathname)) account.querySelector('a[href="profil"]').setAttribute("aria-current", "page");
    signIn.replaceWith(account);
    paintAccount(s);
    document.documentElement.classList.add("is-logged-in");

    const btn = account.querySelector(".avatar-btn");
    const menu = account.querySelector(".account-menu");
    let timer = 0;
    const isOpen = () => btn.getAttribute("aria-expanded") === "true";

    function open() {
      clearTimeout(timer);
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => menu.classList.add("is-open"));
      const first = menu.querySelector(".account-item");
      if (first) first.focus();
    }
    function close(focusButton) {
      if (!isOpen()) return;
      btn.setAttribute("aria-expanded", "false");
      menu.classList.remove("is-open");
      timer = setTimeout(() => { menu.hidden = true; }, 260);
      if (focusButton) btn.focus();
    }

    btn.addEventListener("click", () => (isOpen() ? close() : open()));
    document.addEventListener("click", (e) => { if (!account.contains(e.target)) close(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen()) { e.stopPropagation(); close(true); }
    });
    // leaving the menu with Tab closes it
    account.addEventListener("focusout", (e) => {
      if (isOpen() && !account.contains(e.relatedTarget)) close();
    });
    account.querySelector("[data-logout]").addEventListener("click", () => {
      api.logout();
      api.rememberNext(null);
      api.rememberIntent(null);
      location.href = "./";
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderHeader);
  else renderHeader();
})();
