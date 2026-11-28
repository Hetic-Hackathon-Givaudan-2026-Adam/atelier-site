/* =========================================================
   Givaudan Atelier — demo clock (load before every other script)

   The whole demo story is told on ONE day: DEMO_DATE. Every business
   date (projects, orders, feedback, messages, sales actions) comes from
   here, with the real time of day so message times still look natural.
   Date.now() stays for technical uses only (ids, timers, throttles).
   ========================================================= */
window.AtelierClock = (() => {
  "use strict";

  const pad = (n) => String(n).padStart(2, "0");
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // "YYYY-MM-DD" (local noon) or any date string / Date
  function parse(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dayOf = (value) => {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) && !/Z$|[+-]\d{2}:\d{2}$/.test(value)) return value.slice(0, 10);
    const d = parse(value);
    return d ? isoDay(d) : null;
  };
  const DEMO_DATE = isoDay(new Date());
  const shift = (day, n) => { const d = parse(day); d.setDate(d.getDate() + n); return isoDay(d); };

  // a Date on the demo day, at the real current time
  const now = () => new Date();
  // local "YYYY-MM-DDTHH:MM:SS" (no time zone, so it never jumps a day)
  const nowISO = () => { const d = now(); return `${isoDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const todayISO = () => DEMO_DATE;
  const isToday = (value) => dayOf(value) === DEMO_DATE;
  const isYesterday = (value) => dayOf(value) === shift(DEMO_DATE, -1);
  const fr = (value, opts) => { const d = parse(dayOf(value)); return d ? d.toLocaleDateString("fr-FR", opts) : "—"; };

  // inbox / lists: "Aujourd'hui", "Hier", "17 nov."
  const relativeLabel = (value) => (isToday(value) ? "Aujourd'hui" : isYesterday(value) ? "Hier" : fr(value, { day: "numeric", month: "short" }));
  // day separators: "Aujourd'hui", "Hier", "17 novembre 2026"
  const dayLabel = (value) => (isToday(value) ? "Aujourd'hui" : isYesterday(value) ? "Hier" : fr(value, { day: "numeric", month: "long", year: "numeric" }));

  // "Créé le …": "22 novembre 2026". A date after the demo day (saved by an
  // older version with the real clock) is shown on the demo day.
  const dateLabel = (value) => { const d = dayOf(value); return fr(d && d > DEMO_DATE ? DEMO_DATE : d, { day: "numeric", month: "long", year: "numeric" }); };

  return { DEMO_DATE, now, nowISO, todayISO, isToday, isYesterday, relativeLabel, dayLabel, dateLabel, dayOf };
})();
