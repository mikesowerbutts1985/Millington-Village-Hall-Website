// events.js (ES module) — split into Special Events (one-off) + Regular Events (recurring)
const DATA_URL = "events/events.json"; // (you told me future reference is events/events.json — noted for next time)

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isValidDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isValidDate(d) ? d : null;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function addWeeks(d, weeks) {
  return addDays(d, weeks * 7);
}

function addMonths(d, months) {
  const x = new Date(d);
  const day = x.getDate();
  x.setMonth(x.getMonth() + months);
  // handle rollover (e.g. 31st)
  if (x.getDate() !== day) x.setDate(0);
  return x;
}

function setTimeFromAnchor(dateOnly, anchor) {
  const x = new Date(dateOnly);
  x.setHours(anchor.getHours(), anchor.getMinutes(), anchor.getSeconds(), anchor.getMilliseconds());
  return x;
}

function weeksBetween(a, b) {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

/* =========================================================
   Cadence → Next occurrence
   ========================================================= */

function nextWeeklyOccurrence({ anchorStart, interval, weekday }, now) {
  if (!anchorStart) return null;

  const intv = Number(interval ?? 1);
  const wd = Number(weekday);

  if (!Number.isFinite(intv) || intv < 1 || !Number.isFinite(wd) || wd < 0 || wd > 6) return null;

  // Find first matching weekday on/after anchorStart (keeping anchor time)
  const anchorDay = startOfDay(anchorStart);
  const deltaToWd = (wd - anchorDay.getDay() + 7) % 7;
  const firstDay = addDays(anchorDay, deltaToWd);
  let base = setTimeFromAnchor(firstDay, anchorStart);

  if (base.getTime() < anchorStart.getTime()) base = addWeeks(base, 1);

  if (base.getTime() > now.getTime()) return base;

  // Step in interval-week blocks from base
  const w = weeksBetween(base, now);
  const blocks = Math.floor(w / intv);
  let candidate = addWeeks(base, blocks * intv);
  while (candidate.getTime() <= now.getTime()) candidate = addWeeks(candidate, intv);

  return candidate;
}

function nthWeekdayOfMonth(year, monthIndex, weekday, weekOfMonth) {
  const first = new Date(year, monthIndex, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  const day = 1 + offset + (weekOfMonth - 1) * 7;
  return new Date(year, monthIndex, day);
}

function nextMonthlyOccurrence({ anchorStart, weekday, weekOfMonth }, now) {
  if (!anchorStart) return null;

  const wd = Number(weekday);
  const wom = Number(weekOfMonth);

  if (!Number.isFinite(wd) || wd < 0 || wd > 6 || !Number.isFinite(wom) || wom < 1 || wom > 5) return null;

  let cursor = new Date(now.getFullYear(), now.getMonth(), 1);

  for (let i = 0; i < 24; i++) {
    const occDateOnly = nthWeekdayOfMonth(cursor.getFullYear(), cursor.getMonth(), wd, wom);
    const occ = setTimeFromAnchor(occDateOnly, anchorStart);

    if (occ.getTime() < anchorStart.getTime()) {
      cursor = addMonths(cursor, 1);
      continue;
    }

    if (occ.getTime() > now.getTime()) return occ;

    cursor = addMonths(cursor, 1);
  }

  return null;
}

function nextOccurrenceForEvent(ev, now) {
  const cadence = ev?.cadence;
  if (!cadence || typeof cadence !== "object") return null;

  const anchorStart = parseDate(ev.dateStart);
  if (!anchorStart) return null;

  if (cadence.type === "weekly") {
    return nextWeeklyOccurrence({ anchorStart, interval: cadence.interval, weekday: cadence.weekday }, now);
  }

  if (cadence.type === "monthly") {
    return nextMonthlyOccurrence({ anchorStart, weekday: cadence.weekday, weekOfMonth: cadence.weekOfMonth }, now);
  }

  return null;
}

/* =========================================================
   Formatting
   ========================================================= */

function formatDateRange(start, end) {
  if (!start) return "";

  const dateOpts = { weekday: "short", year: "numeric", month: "short", day: "numeric" };
  const timeOpts = { hour: "2-digit", minute: "2-digit" };

  const datePart = start.toLocaleDateString(undefined, dateOpts);
  const startTime = start.toLocaleTimeString(undefined, timeOpts);

  if (!end) return `${datePart} • ${startTime}`;

  const endTime = end.toLocaleTimeString(undefined, timeOpts);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  if (sameDay) return `${datePart} • ${startTime}–${endTime}`;

  const endDatePart = end.toLocaleDateString(undefined, dateOpts);
  return `${datePart} ${startTime} → ${endDatePart} ${endTime}`;
}

function formatNextOccurrence(d) {
  const opts = { weekday: "short", year: "numeric", month: "short", day: "numeric" };
  return d.toLocaleDateString(undefined, opts);
}

function renderLinks(links) {
  if (!Array.isArray(links) || links.length === 0) return "";

  const items = links
    .filter((l) => l && typeof l === "object" && l.href && l.label)
    .map(
      (l) =>
        `<a class="event-link" href="${escapeHtml(l.href)}" target="_blank" rel="noopener">${escapeHtml(
          l.label
        )}</a>`
    );

  return items.length ? `<div class="event-links">${items.join("")}</div>` : "";
}

/* =========================================================
   Rendering
   ========================================================= */

function renderCard(item) {
  const ev = item.ev;

  const title = escapeHtml(ev.title);
  const summary = escapeHtml(ev.summary);
  const location = escapeHtml(ev.location);

  const img =
    ev.image
      ? `<div class="event-media"><img src="${escapeHtml(
          ev.image
        )}" alt="" loading="lazy" onerror="this.closest('.event-card')?.classList.add('no-image'); this.remove();" /></div>`
      : "";

  const metaLines = [];

  if (item.kind === "recurring" && item.when) {
    metaLines.push(
      `<div class="event-meta"><span class="event-badge">Regular</span> Next Event: ${escapeHtml(
        formatNextOccurrence(item.when)
      )}</div>`
    );
    if (ev.schedule) metaLines.push(`<div class="event-meta">${escapeHtml(ev.schedule)}</div>`);
  } else {
    const start = parseDate(ev.dateStart);
    const end = parseDate(ev.dateEnd);
    if (start)
      metaLines.push(
        `<div class="event-meta"><span class="event-badge">Special</span> ${escapeHtml(formatDateRange(start, end))}</div>`
      );
  }

  if (location) metaLines.push(`<div class="event-meta">${location}</div>`);

  const links = renderLinks(ev.links);

  return `
    <article class="event-card">
      ${img}
      <div class="event-body">
        <h3 class="event-title">${title}</h3>
        ${metaLines.join("")}
        ${summary ? `<p class="event-summary">${summary}</p>` : ""}
        ${links}
      </div>
    </article>
  `.trim();
}

function setEmpty(el, message) {
  el.innerHTML = `<p class="events-empty">${escapeHtml(message)}</p>`;
}

async function loadEvents() {
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${DATA_URL} (${res.status})`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("events.json must be an array");
  return data;
}

function isRecurring(ev) {
  return ev && typeof ev === "object" && ev.recurring === true;
}

function isUpcomingOneOff(ev, now) {
  const start = parseDate(ev.dateStart);
  if (!start) return false;

  const end = parseDate(ev.dateEnd);
  const cutoff = end ?? start;
  return cutoff.getTime() >= now.getTime();
}

async function main() {
  // New containers
  const specialEl = document.getElementById("events-special");
  const regularEl = document.getElementById("events-regular");

  // Back-compat fallback (if someone loads older HTML)
  const legacyListEl = document.getElementById("events-list");

  // If we have the new containers, use them. Otherwise keep legacy behaviour.
  const useSplit = !!(specialEl && regularEl);

  try {
    const events = await loadEvents();
    const now = new Date();

    const special = [];
    const regular = [];

    for (const ev of events) {
      if (!ev || typeof ev !== "object") continue;

      if (isRecurring(ev)) {
        const next = nextOccurrenceForEvent(ev, now);
        // Only include recurring events that have a computable next date.
        if (next) regular.push({ kind: "recurring", when: next, ev });
        continue;
      }

      if (isUpcomingOneOff(ev, now)) {
        const start = parseDate(ev.dateStart);
        if (start) special.push({ kind: "oneoff", when: start, ev });
      }
    }

    special.sort((a, b) => a.when.getTime() - b.when.getTime());
    regular.sort((a, b) => a.when.getTime() - b.when.getTime());

    if (!useSplit) {
      // Legacy single list
      if (!legacyListEl) return;

      const combined = [...special, ...regular];
      if (combined.length === 0) {
        setEmpty(legacyListEl, "No events currently listed.");
        return;
      }
      legacyListEl.innerHTML = combined.map(renderCard).join("");
      return;
    }

    // Split lists (new requirement)
    if (special.length === 0) setEmpty(specialEl, "No special events currently listed.");
    else specialEl.innerHTML = special.map(renderCard).join("");

    if (regular.length === 0) setEmpty(regularEl, "No regular events currently listed.");
    else regularEl.innerHTML = regular.map(renderCard).join("");
  } catch (err) {
    console.error(err);

    if (useSplit) {
      setEmpty(specialEl, "Sorry — the events list couldn’t be loaded.");
      setEmpty(regularEl, "");
      return;
    }

    if (legacyListEl) setEmpty(legacyListEl, "Sorry — the events list couldn’t be loaded.");
  }
}

main();
