// Shared task logic. Imported by the Worker (src/worker.js) AND by the page (index.html),
// so the browser and the server always apply changes in exactly the same way.
//
// Data model (one KV entry per week, key "wk:<Monday>"):
//   { ver, days: { "YYYY-MM-DD": { tasks: [Task], note: "", seeded: bool } } }
//   Task = { id, text, done, skip, doneAt, time:"HH:MM"|"", cat, src, note }
//     done  = ticked off          skip = "not needed today" (counts as resolved)
//     src   = routine item id (or "p:<projectId>") the task came from, "" for ad-hoc tasks
//
// Changes travel as small "ops" so two devices never overwrite each other's work.

export const CATS = {
  meet:  { name: 'Meeting',          color: '#FFD637' },
  stock: { name: 'Counts & checks',  color: '#47D7AC' },
  plan:  { name: 'Planning',         color: '#FDAA63' },
  proj:  { name: 'Project',          color: '#7566A0' },
  gen:   { name: 'General',          color: '#99D6EA' },
};

const DAY_MS = 86400000;
export const isoMs = (iso) => Date.parse(iso + 'T00:00:00Z');
export const addDays = (iso, n) => new Date(isoMs(iso) + n * DAY_MS).toISOString().slice(0, 10);
export const dowOf = (iso) => new Date(isoMs(iso)).getUTCDay(); // 0 = Sunday
export const mondayOf = (iso) => addDays(iso, -((dowOf(iso) + 6) % 7));
export const validDate = (s) =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(isoMs(s)) && new Date(isoMs(s)).toISOString().slice(0, 10) === s &&
  s >= '2020-01-01' && s <= '2100-01-01';
export const isMonday = (s) => validDate(s) && dowOf(s) === 1;

const ID_RE = /^[A-Za-z0-9_-]{3,48}$/;
export const validId = (s) => typeof s === 'string' && ID_RE.test(s);

const clean = (v, max) =>
  String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);

// "1330 Meeting", "09:00 Call", "9am stand-up"  ->  { time:"13:30", text:"Meeting" }
export function parseTime(raw) {
  const s = String(raw || '').trim();
  let m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?\s*[-–:]?\s*(.*)$/i);
  let h, min, rest;
  if (m) { h = +m[1]; min = +m[2]; rest = m[4]; if (m[3]) { const p = m[3].toLowerCase(); if (p === 'pm' && h < 12) h += 12; if (p === 'am' && h === 12) h = 0; } }
  else if ((m = s.match(/^(\d{1,2})\s*(am|pm)\b\s*[-–:]?\s*(.*)$/i))) {
    h = +m[1]; min = 0; rest = m[3]; const p = m[2].toLowerCase(); if (p === 'pm' && h < 12) h += 12; if (p === 'am' && h === 12) h = 0;
  } else if ((m = s.match(/^([01]\d|2[0-3])([0-5]\d)\s+(.*)$/))) { h = +m[1]; min = +m[2]; rest = m[3]; }
  else return { time: '', text: s };
  if (h > 23 || min > 59 || !rest || !rest.trim()) return { time: '', text: s };
  return { time: String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0'), text: rest.trim() };
}

// Category is stored only when the user picks one; otherwise it is guessed from the wording.
export function guessCat(t) {
  const x = t.text || '';
  if ((t.src || '').startsWith('p:')) return 'proj';
  if (t.time || /\bmeeting\b|town hall|\bcall\b|safety conversation|\bhuddle\b/i.test(x)) return 'meet';
  if (/\bLBB\b|plan (attainment|changes)|brew plan|production plan|\bKPIs?\b|ignition|pre supply/i.test(x)) return 'plan';
  if (/\bprojects?\b|\bSOPs?\b|pilot recipe|stock tool|newsletter|website|\bdeck\b|submission|handover|build |create |update /i.test(x)) return 'proj';
  if (/\b(count|PO|order|check|stocktake|grain|silos?|hops|CO2|ecolab|lactic|yeast|glue|pallets?|gas|cans?|kegs?|clusters?|receive|COAs?|CIP|transfer|filters?|visy|orora|logistics)\b/i.test(x)) return 'stock';
  return 'gen';
}
export const catOf = (t) => (t.cat && CATS[t.cat] ? t.cat : guessCat(t));

// "(when necessary)", "(not necessary)", "(if necessary w/ James)", "(when required)" are no longer shown —
// whether a task was needed is now recorded with the Hazy ✗ button instead.
export function stripNecessary(s) {
  const src = String(s == null ? '' : s);
  const out = src
    .replace(/\s*\(([^)]*(?:necessary|when required)[^)]*)\)/gi, (m, inner) => {
      const rest = inner.replace(/\b(?:f?not\s*|no\s+PO\s+|if\s+|when\s+)(?:necessary|required)\b|\bnecessary\b/gi, '').replace(/^[\s\-–]+|[\s\-–]+$/g, '');
      return rest ? ' (' + rest + ')' : '';
    })
    .replace(/\s*-\s*PO\s+not\s+necessary\s*$/i, '')
    .replace(/\s{2,}/g, ' ').trim();
  return out || src.trim();
}

export function cleanTask(t) {
  t = t && typeof t === 'object' ? t : {};
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(t.time || '') ? t.time : '';
  const doneAt = Number.isFinite(t.doneAt) && t.doneAt > 0 ? Math.round(t.doneAt) : null;
  const skip = !!t.skip && !t.done;
  return {
    id: validId(t.id) ? t.id : '',
    text: stripNecessary(clean(t.text, 300)),
    done: !!t.done,
    skip,
    doneAt: t.done ? doneAt : null,
    time,
    cat: CATS[t.cat] ? t.cat : '',
    src: clean(t.src, 60),
    note: clean(t.note, 500),
  };
}

export const emptyWeek = () => ({ ver: '', days: {} });
export function normaliseWeek(doc) {
  const out = emptyWeek();
  if (!doc || typeof doc !== 'object') return out;
  out.ver = doc.ver || '';
  for (const [d, v] of Object.entries(doc.days || {})) {
    if (!validDate(d) || !v) continue;
    out.days[d] = {
      tasks: (Array.isArray(v.tasks) ? v.tasks : []).map(cleanTask).filter((t) => t.id && t.text),
      note: clean(v.note, 2000),
      seeded: !!v.seeded,
    };
  }
  return out;
}

function ensureDay(doc, date) {
  return doc.days[date] || (doc.days[date] = { tasks: [], note: '', seeded: false });
}
const findIn = (day, id) => day.tasks.findIndex((t) => t.id === id);

export function seedTasksFor(date, routine) {
  const items = (routine && routine[String(dowOf(date))]) || [];
  const stamp = date.replace(/-/g, '');
  return items
    .filter((it) => it && it.text && validId(it.id))
    .map((it) => cleanTask({ id: (it.id + '-' + stamp).slice(0, 48), text: it.text, time: it.time || '', cat: it.cat || '', src: it.id }));
}

// Apply a list of ops to a week document (mutates and returns it).
export function applyOps(doc, ops, ctx) {
  const monday = ctx.monday;
  const routine = ctx.routine || {};
  const inWeek = (d) => validDate(d) && d >= monday && d <= addDays(monday, 6);
  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;
    switch (op.op) {
      case 'add': {
        if (!inWeek(op.date)) break;
        const t = cleanTask(op.task);
        if (!t.id || !t.text) break;
        if (doc.days[op.date] && findIn(doc.days[op.date], t.id) > -1) break;
        const day = ensureDay(doc, op.date);
        if (Number.isInteger(op.index) && op.index >= 0 && op.index < day.tasks.length) day.tasks.splice(op.index, 0, t);
        else day.tasks.push(t);
        break;
      }
      case 'upd': {
        if (!inWeek(op.date) || !doc.days[op.date]) break;
        const day = doc.days[op.date];
        const i = findIn(day, op.id);
        if (i < 0) break;
        const cur = day.tasks[i];
        const s = op.set && typeof op.set === 'object' ? op.set : {};
        const next = { ...cur };
        if ('text' in s) next.text = stripNecessary(clean(s.text, 300)) || cur.text;
        if ('time' in s) next.time = s.time;
        if ('cat' in s) next.cat = s.cat;
        if ('note' in s) next.note = s.note;
        if ('done' in s) {
          next.done = !!s.done;
          next.doneAt = next.done ? (Number.isFinite(op.at) ? op.at : Date.now()) : null;
          if (next.done) next.skip = false;
        }
        if ('skip' in s) {
          next.skip = !!s.skip;
          if (next.skip) { next.done = false; next.doneAt = null; }
        }
        day.tasks[i] = cleanTask(next);
        break;
      }
      case 'del': {
        if (!inWeek(op.date) || !doc.days[op.date]) break;
        const day = doc.days[op.date];
        const i = findIn(day, op.id);
        if (i > -1) day.tasks.splice(i, 1);
        break;
      }
      case 'move': {
        // same-week move; cross-week moves are sent as add (new week) + del (old week)
        if (!inWeek(op.from) || !inWeek(op.to) || !doc.days[op.from]) break;
        const src = doc.days[op.from];
        const i = findIn(src, op.id);
        if (i < 0) break;
        const dst = ensureDay(doc, op.to);
        if (findIn(dst, op.id) > -1) { if (op.from !== op.to) src.tasks.splice(i, 1); break; }
        const [t] = src.tasks.splice(i, 1);
        if (Number.isInteger(op.index) && op.index >= 0 && op.index < dst.tasks.length) dst.tasks.splice(op.index, 0, t);
        else dst.tasks.push(t);
        break;
      }
      case 'order': {
        if (!inWeek(op.date) || !doc.days[op.date] || !Array.isArray(op.ids)) break;
        const day = doc.days[op.date];
        const byId = new Map(day.tasks.map((t) => [t.id, t]));
        const out = [];
        for (const id of op.ids) if (byId.has(id)) { out.push(byId.get(id)); byId.delete(id); }
        for (const t of day.tasks) if (byId.has(t.id)) out.push(t);
        day.tasks = out;
        break;
      }
      case 'note': {
        if (!inWeek(op.date)) break;
        const text = clean(op.text, 2000);
        if (!text.trim() && !doc.days[op.date]) break;
        ensureDay(doc, op.date).note = text;
        break;
      }
      case 'seed': {
        // First view of a day: lay out that weekday's routine. Runs once per day (or on demand with addMissing).
        if (!inWeek(op.date)) break;
        const day = ensureDay(doc, op.date);
        if (day.seeded && !op.addMissing) break;
        for (const t of seedTasksFor(op.date, routine)) {
          const exists = day.tasks.some((x) => x.id === t.id || (op.addMissing && x.src === t.src));
          if (!exists) day.tasks.push(t);
        }
        day.seeded = true;
        break;
      }
      default:
    }
  }
  // drop empty untouched days so the document stays tidy
  for (const [d, day] of Object.entries(doc.days)) {
    if (!day.tasks.length && !day.note && !day.seeded) delete doc.days[d];
  }
  return doc;
}

// Progress of one day: resolved = done + not needed.
export function dayStats(day) {
  const tasks = (day && day.tasks) || [];
  let done = 0, skip = 0;
  for (const t of tasks) { if (t.done) done++; else if (t.skip) skip++; }
  const total = tasks.length;
  return { total, done, skip, open: total - done - skip, pct: total ? (done + skip) / total : 0 };
}
