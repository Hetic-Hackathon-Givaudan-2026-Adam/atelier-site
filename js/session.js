/* Gestion de la session Supabase et des accès par page. */
(() => {
  "use strict";

  const KEY = "givaudanAtelier.session";
  const NEXT_KEY = "atelierNext"; // destination kept in sessionStorage across the login page
  const REORDER_KEY = "atelierOpenReorder"; // "1" → open the reorder modal on Mes commandes
  // only these pages are accepted as a post-login destination (no open redirect)
  const NEXT_PAGES = ["mes-projets", "commandes", "creer-projet", "messages", "brief", "espace-commercial", "commercial-messages"];
  const DEFAULT_NEXT = "mes-projets";

  // "creer-projet", "/creer-projet", "creer-projet.html" → "creer-projet"; anything else → null
  const normalizeNext = (value) => {
    if (typeof value !== "string") return null;
    const v = value.trim().replace(/^\.?\//, "").replace(/\.html$/, "");
    return NEXT_PAGES.includes(v) ? v : null;
  };

  let currentSession = null;

  const read = () => currentSession;

  async function loadSession() {
    currentSession = null;

    try {


      if (!supabaseClient) return null;
      const { data, error } = await supabaseClient.auth.getUser();

      if (error || !data.user) return null;

      const user = data.user;

      const { data: profile, error: profileError } =
        await supabaseClient
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

      if (profileError) throw profileError;

      const metadata = user.user_metadata || {};
      const names = (profile.full_name || "").trim().split(/\s+/);

      currentSession = {
        id: user.id,
        email: user.email,
        firstName: metadata.first_name || names[0] || "Client",
        lastName: metadata.last_name || names.slice(1).join(" ") || "Atelier",
        company: metadata.company || "Entreprise non renseignée",
        role: profile.role,
        existingClient: false,
        since: Date.now()
      };

      return currentSession;

    } catch (error) {
      console.error("Erreur session Supabase :", error.message);
      return null;
    }
  }

  const api = {
    get: read,

    isLoggedIn: () => Boolean(currentSession),

    login: loadSession,

    update(patch) {
      if (!currentSession) return null;

      if (typeof patch.existingClient === "boolean") {
        currentSession.existingClient = patch.existingClient;
      }

      return currentSession;
    },

    async logout() {
      const { error } = await supabaseClient.auth.signOut();

      if (error) throw error;

      currentSession = null;
      localStorage.removeItem(KEY);
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

  const pageRole = document.documentElement.getAttribute("data-protected");
  const protectedPage = pageRole !== null;
  const allowed = (session) => session && (pageRole === "commercial"
    ? ["commercial", "admin"].includes(session.role) : session.role === "client");
  api.destination = (session, next) => session.role === "client"
    ? (["espace-commercial", "commercial-messages"].includes(next) ? DEFAULT_NEXT : next)
    : session.role === "commercial" && next === "commercial-messages" ? next : "espace-commercial";

  if (protectedPage) {
    document.documentElement.style.visibility = "hidden";
  }

  api.ready = loadSession().then((session) => {
    if (protectedPage && session && !allowed(session)) {
      location.replace(api.destination(session, DEFAULT_NEXT));
      return null;
    }
    if (protectedPage && !session) {
      const page = api.safeNext(location.pathname.split("/").pop());
      api.rememberNext(page);
      location.replace(`connexion?next=${encodeURIComponent(page)}`);
      return null;
    }

    document.documentElement.style.visibility = "";
    return session;
  });

  supabaseClient?.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      const wasSignedIn = Boolean(currentSession);
      currentSession = null;
      if (protectedPage && wasSignedIn) {
        document.documentElement.style.visibility = "hidden";
        setTimeout(() => location.replace("connexion"), 0);
      }
    }
  });

  window.addEventListener("pageshow", (event) => {
    if (protectedPage && event.persisted) location.reload();
  });

  /* ---------------- Header ---------------- */
  function renderHeader() {
    const s = read();
    const hasModal = Boolean(document.getElementById("auth-modal"));

    // actions that need an account: direct link when logged in, otherwise the
    // login modal (landing page) or the login page with the right "next"
    document.querySelectorAll("[data-auth-next]").forEach((el) => {
      const next = el.dataset.authNext;
      const hash = el.dataset.authHash ? `#${el.dataset.authHash}` : ""; // e.g. commandes#recommander
      if (s) el.setAttribute("href", api.destination(s, next) + hash);
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
        <a href="#" class="account-item">Mon profil</a>
        <button type="button" class="account-item" data-logout>Se déconnecter</button>
      </div>`;
    const name = `${s.firstName} ${s.lastName}`;
    account.querySelectorAll(".avatar-initials").forEach((el) => { el.textContent = api.initials(s); });
    account.querySelector(".avatar-btn .sr-only").textContent = `Mon compte : ${name}`;
    account.querySelector(".account-name").textContent = name;
    account.querySelector(".account-status").textContent = { client: "Espace client", commercial: "Commercial", admin: "Administrateur" }[s.role];
    signIn.replaceWith(account);
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
    account.querySelector("[data-logout]").addEventListener("click", async () => {
      try {
        await api.logout();
      } catch (error) {
        console.error("Erreur de deconnexion :", error);
        alert("Impossible de se deconnecter : " + error.message);
        return;
      }
      api.rememberNext(null);
      api.rememberIntent(null);
      location.replace("connexion");
    });
  }

  async function initHeader() {
    await api.ready;

    if (protectedPage && !allowed(read())) {
      return;
    }

    document.querySelectorAll("[data-staff-logout]").forEach((button) => {
      button.addEventListener("click", async () => {
        try { await api.logout(); location.replace("connexion"); }
        catch (error) { alert(error.message); }
      });
    });
    renderHeader();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeader);
  } else {
    initHeader();
  }
})();
