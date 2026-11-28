/* Commandes persistées par utilisateur dans Supabase. */
window.AtelierOrders = (() => {
  "use strict";


  // The demo story is told on 22 November 2026 ("livré demain", timelines,
  // reorder dates). Pinned so the prototype stays coherent on any day.
  const TODAY = (window.AtelierClock && window.AtelierClock.DEMO_DATE) || "2026-11-22"; // js/clock.js

  const STATUSES = ["confirmee", "preparation", "expediee", "livree"];
  const STEP_LABELS = ["Confirmée", "En préparation", "Expédiée", "Livrée"];
  const HISTORY_LABELS = ["Commande confirmée", "En préparation", "Expédiée", "Livrée"];
  const NUMBER_BASE = 146; // first new number: GA-2026-0147

  /* ---------------- dates (date-only ISO strings, local noon) ---------------- */
  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (value, n) => { const d = parseDate(value); d.setDate(d.getDate() + n); return iso(d); };
  const frDate = (value, opts = { day: "numeric", month: "long", year: "numeric" }) => {
    const d = parseDate(value);
    return d ? d.toLocaleDateString("fr-FR", opts) : "—";
  };
  const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);

  function defaultAddress() {
    const s = window.AtelierSession && window.AtelierSession.get();
    return {
      company: (s && s.company) || "Maison Koné",
      line: "12 rue de la Paix",
      city: "75002 Paris",
      country: "France",
    };
  }

  /* ---------------- sample orders ---------------- */
  function samples() {
    const address = defaultAddress();
    return [
      {
        id: "sample-order-brise",
        number: "GA-2026-0132",
        type: "echantillon",
        reference: "Brise de Calabre",
        category: "Bain & douche",
        quantity: "50 ml",
        orderedAt: "2026-11-18",
        expectedAt: "2026-11-23",
        deliveredAt: null,
        status: "expediee",
        history: [
          { date: "2026-11-18", label: "Commande confirmée" },
          { date: "2026-11-19", label: "En préparation — formulation de l'échantillon" },
          { date: "2026-11-20", label: "Expédiée depuis Vernier (Suisse)" },
        ],
        address,
        projectId: "sample-gel-douche-sport-intense",
        projectName: "Gel douche Sport Intense",
        carrier: {
          name: "DHL Express",
          trackingNumber: "JD0146 0000 6281 7345",
          events: [
            { date: "2026-11-22", time: "07:05", label: "Arrivé au centre de distribution", place: "Roissy-en-France" },
            { date: "2026-11-21", time: "09:40", label: "En transit", place: "Lyon" },
            { date: "2026-11-20", time: "16:30", label: "Pris en charge par le transporteur", place: "Genève" },
          ],
        },
      },
      {
        id: "sample-order-linge",
        number: "GA-2026-0138",
        type: "reassort",
        reference: "Linge au Soleil",
        category: "Soin du linge",
        quantity: "200 kg",
        orderedAt: "2026-11-20",
        expectedAt: "2026-12-04",
        deliveredAt: null,
        status: "preparation",
        history: [
          { date: "2026-11-20", label: "Commande confirmée" },
          { date: "2026-11-21", label: "En préparation — production du lot" },
        ],
        address,
        projectId: "sample-lessive-fraicheur",
        projectName: "Lessive Fraîcheur",
        carrier: null,
      },
      {
        id: "sample-order-ambre",
        number: "GA-2026-0119",
        type: "echantillon",
        reference: "Ambre Doré",
        category: "Bougie",
        quantity: "50 ml",
        orderedAt: "2026-11-05",
        expectedAt: "2026-11-10",
        deliveredAt: "2026-11-10",
        status: "livree",
        history: [
          { date: "2026-11-05", label: "Commande confirmée" },
          { date: "2026-11-06", label: "En préparation" },
          { date: "2026-11-07", label: "Expédiée" },
          { date: "2026-11-10", label: "Livrée — réceptionnée par l'accueil" },
        ],
        address,
        projectId: "sample-bougie-cocooning",
        projectName: "Bougie Cocooning",
        carrier: { name: "Chronopost", trackingNumber: "XW 4471 0285 6FR", events: [] },
      },
    ];
  }

  /* ---------------- normalize (safe defaults, legacy records) ---------------- */
  function statusOf(raw) {
    if (STATUSES.includes(raw)) return raw;
    // a retouch request is studied by the perfumers before it is confirmed
    if (raw === "etude") return "etude";
    const s = String(raw || "").toLowerCase();
    if (/livr[ée]e?s?$/.test(s) && !/livraison/.test(s)) return "livree";
    if (/exp[ée]di|livraison|transit/.test(s)) return "expediee";
    if (/pr[ée]par/.test(s)) return "preparation";
    return "confirmee";
  }

  function normalize(o = {}) {
    const type = o.type === "reassort" || /r[ée]assort/i.test(o.type || "") ? "reassort" : "echantillon";
    const status = statusOf(o.status);
    const orderedAt = parseDate(o.orderedAt || o.date) ? iso(parseDate(o.orderedAt || o.date)) : TODAY;
    const expectedAt = parseDate(o.expectedAt) ? iso(parseDate(o.expectedAt)) : addDays(orderedAt, type === "reassort" ? 14 : 7);
    const deliveredAt = parseDate(o.deliveredAt) ? iso(parseDate(o.deliveredAt)) : status === "livree" ? expectedAt : null;
    const number = o.number || o.id || "GA-2026-0000";
    const step = STATUSES.indexOf(status);
    const history = Array.isArray(o.history) && o.history.length
      ? o.history.map((h) => ({ date: parseDate(h.date) ? iso(parseDate(h.date)) : orderedAt, label: h.label || "Mise à jour" }))
      : HISTORY_LABELS.slice(0, step + 1).map((label) => ({ date: orderedAt, label }));
    const quantity = o.quantity || (o.format ? String(o.format).replace(/^Échantillon\s*/i, "") : "") || (type === "reassort" ? "—" : "50 ml");
    const a = o.address && typeof o.address === "object" ? o.address : {};
    const d = defaultAddress();
    return {
      id: String(o.id || number),
      number,
      type,
      reference: o.reference || o.name || "Référence",
      category: o.category || o.product || "Fragrance",
      quantity,
      orderedAt,
      expectedAt,
      deliveredAt,
      status,
      history,
      address: { company: a.company || d.company, line: a.line || d.line, city: a.city || d.city, country: a.country || d.country },
      projectId: o.projectId || null,
      projectName: o.projectName || null,
      carrier: o.carrier && o.carrier.name
        ? { name: o.carrier.name, trackingNumber: o.carrier.trackingNumber || "—", events: Array.isArray(o.carrier.events) ? o.carrier.events : [] }
        : null,
      comment: o.comment || "",
      // retouch request of an adjusted sample: { adjustments, emphasize, soften, note, requestedAt }
      retouche: o.retouche && typeof o.retouche === "object" ? { ...o.retouche } : null,
      // sample feedback: { verdict, date, adjust?, reason?, note?, next?, ... }
      feedback: o.feedback && ["fits", "adjust", "no"].includes(o.feedback.verdict) ? { ...o.feedback } : null,
      sample: Boolean(o.sample),
    };
  }

  /* ---------------- storage ---------------- */
  const load = () => window.AtelierData?.preference("orders") || [];
  const save = (list) => AtelierData.savePreference("orders", list);

  /* all orders, newest order date first. includeSamples: false for a new client */
  function list({ includeSamples = true } = {}) {
    const byId = new Map();

    load().forEach((o) => {
      const n = normalize(o);
      byId.set(n.id, { ...n, sample: false });
    });
    return [...byId.values()]
      .map(normalize)
      .sort((a, b) => (b.orderedAt.localeCompare(a.orderedAt)) || b.number.localeCompare(a.number));
  }

  // next free number, never one already used (samples included)
  function nextNumber() {
    const used = [...samples(), ...load()].map((o) => {
      const m = /GA-\d{4}-(\d+)/.exec(o.number || o.id || "");
      return m ? parseInt(m[1], 10) : 0;
    });
    return `GA-2026-${String(Math.max(NUMBER_BASE, ...used) + 1).padStart(4, "0")}`;
  }

  function add(order) {
    const number = order.number || nextNumber();
    const o = normalize({ ...order, number, id: order.id || number });
    delete o.sample;
    const stored = load().filter((x) => (x.id || x.number) !== o.id);
    stored.unshift(o);
    save(stored);
    return o;
  }

  /* patch an order — a sample order is copied into localStorage with the
     patch (the stored version wins, like any saved order) */
  function update(id, patch) {
    const current = list().find((o) => o.id === id);
    if (!current) return null;
    const o = normalize({ ...current, ...patch });
    delete o.sample;
    const stored = load();
    const i = stored.findIndex((x) => (x.id || x.number) === id);
    if (i > -1) stored[i] = o; else stored.unshift(o);
    save(stored);
    return o;
  }

  /* ---------------- sample feedback: shared French wording ---------------- */
  const lower = (list) => (list || []).map((x) => x.toLowerCase());
  // "il convient" · "à ajuster (plus intense, plus frais)" · "ne convient pas (pas la bonne direction)"
  function feedbackLabel(fb) {
    if (!fb) return "";
    const details = (picks) => {
      const words = lower(picks).map((w) => (w === "autre" && fb.note ? fb.note : w));
      return words.length ? ` (${words.join(", ")})` : "";
    };
    if (fb.verdict === "fits") return "il convient";
    if (fb.verdict === "adjust") return `à ajuster${details(fb.adjust)}`;
    return `ne convient pas${details(fb.reason)}`;
  }
  // follow-up chosen after the feedback, or ""
  function feedbackNextLabel(fb, existingClient = true) {
    if (!fb || !fb.next) return "";
    const contact = existingClient ? "Claire Martin" : "nos experts";
    return {
      quote: "Devis demandé",
      volume: `Commande en volume passée${fb.volumeOrder ? ` — N° ${fb.volumeOrder}` : ""}`,
      adjusted_sample: `Retouche demandée${fb.adjustedOrder ? ` : N° ${fb.adjustedOrder}` : ""}`,
      dosage: "Vous testez le dosage",
      expert: `Transmis à ${contact}`,
      new_blends: "Nouveaux assemblages demandés",
    }[fb.next] || "";
  }

  const find = (id, opts) => list(opts).find((o) => o.id === id) || null;
  // most recent order of a project (for "Voir le suivi")
  const latestForProject = (projectId, opts) => list(opts).find((o) => o.projectId === projectId) || null;

  return {
    TODAY, STATUSES, STEP_LABELS, update, feedbackLabel, feedbackNextLabel,
    list, find, add, nextNumber, normalize, latestForProject,
    parseDate, iso, addDays, frDate, daysBetween, defaultAddress,
  };
})();
