// State, dates, saving/syncing. No DOM building here (see views.js / app.js).
import { applyOps, emptyWeek, mondayOf, addDays, dowOf, dayStats, catOf } from '/ops.js';
export { applyOps, mondayOf, addDays, dowOf, dayStats, catOf };

export const hooks = { render: () => {}, toast: () => {} };

/* ---------- small helpers ---------- */
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => 't' + [...crypto.getRandomValues(new Uint8Array(9))].map((b) => (b % 36).toString(36)).join('');
const pad = (n) => String(n).padStart(2, '0');
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dtf = (iso, o) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-AU', { timeZone: 'UTC', ...o });
export const longDate = (iso) => dtf(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const shortDate = (iso) => dtf(iso, { weekday: 'short', day: 'numeric', month: 'short' });
export const dm = (iso) => dtf(iso, { day: 'numeric', month: 'short' });
export const wkday = (iso) => dtf(iso, { weekday: 'short' });
export const wkdayLong = (iso) => dtf(iso, { weekday: 'long' });
export const hm = (ms) => new Date(ms).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: false });
export const isWeekend = (iso) => [0, 6].includes(dowOf(iso));
export const nextWD = (iso) => { let d = addDays(iso, 1); while (isWeekend(d)) d = addDays(d, 1); return d; };
export const prevWD = (iso) => { let d = addDays(iso, -1); while (isWeekend(d)) d = addDays(d, -1); return d; };
export const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
};

/* ---------- state ---------- */
export const S = {
  view: 'week', date: todayISO(), weekStart: mondayOf(todayISO()), showWeekend: false,
  config: { routine: {}, projects: [], imported: true }, configLoaded: false,
  weeks: {},      // server copies, by Monday
  pending: [],    // [{w, op}] changes not yet confirmed by the server
  editing: null, inserting: null, dragging: false,
  hideDone: ls.get('pds.hideDone') === '1',
  history: { weeks: [], oldest: null, loading: false, exhausted: false, query: '', filter: 'all', all: null, allLoading: false },
  importDismissed: ls.get('pds.importDismissed') === '1',
  rev: 0,
};
const loading = new Set();
try { S.pending = JSON.parse(ls.get('pds.pending') || '[]').filter((p) => p && p.w && p.op); } catch (e) { S.pending = []; }
const persist = () => ls.set('pds.pending', JSON.stringify(S.pending));

/* ---------- API ---------- */
export async function api(path, { method = 'GET', body } = {}) {
  try {
    const res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    if (res.status === 401 || res.redirected || !(res.headers.get('content-type') || '').includes('json')) {
      if (res.status === 401 || res.redirected) { location.href = '/login'; }
      return { ok: false, status: res.status || 0 };
    }
    return { ok: res.ok, status: res.status, data: await res.json() };
  } catch (e) { return { ok: false, status: 0 }; }
}

/* ---------- documents (server copy + pending changes) ---------- */
const cache = new Map();
export const touch = () => { S.rev++; };
export function docFor(w) {
  const c = cache.get(w);
  if (c && c.rev === S.rev) return c.doc;
  const doc = structuredClone(S.weeks[w] || emptyWeek());
  const ops = S.pending.filter((p) => p.w === w).map((p) => p.op);
  if (ops.length) applyOps(doc, ops, { monday: w, routine: S.config.routine });
  cache.set(w, { rev: S.rev, doc });
  return doc;
}
export const dayOf = (date) => docFor(mondayOf(date)).days[date] || { tasks: [], note: '', seeded: false };
export const findTask = (date, id) => dayOf(date).tasks.find((t) => t.id === id);
export const weekLoaded = (w) => S.weeks[w] !== undefined;

export function dispatch(date, op, weekOverride) {
  S.pending.push({ w: weekOverride || mondayOf(date), op });
  touch(); persist(); hooks.render(); scheduleFlush();
}
export const upd = (date, id, set) => dispatch(date, { op: 'upd', date, id, set, at: Date.now() });
export function addTask(date, fields, index) {
  const task = { id: uid(), text: '', done: false, skip: false, time: '', cat: '', src: '', note: '', ...fields };
  dispatch(date, { op: 'add', date, task, index });
  return task;
}

// Move (or reorder) a task. opts: {beforeId} or {index}. Works across weeks.
export function moveTask(id, from, to, opts = {}) {
  const t = findTask(from, id);
  if (!t) return;
  const target = dayOf(to).tasks.filter((x) => x.id !== id);
  let index = opts.index != null ? opts.index : opts.beforeId ? target.findIndex((x) => x.id === opts.beforeId) : -1;
  if (index < 0) index = undefined;
  if (from === to) {
    const ids = target.map((x) => x.id);
    ids.splice(index == null ? ids.length : index, 0, id);
    dispatch(from, { op: 'order', date: from, ids });
  } else if (mondayOf(from) === mondayOf(to)) {
    dispatch(from, { op: 'move', id, from, to, index });
  } else {
    S.pending.push({ w: mondayOf(to), op: { op: 'add', date: to, task: { ...t }, index } });
    dispatch(from, { op: 'del', date: from, id });
    ensureWeek(mondayOf(to));
  }
}
export function deleteTask(date, id) {
  const day = dayOf(date); const index = day.tasks.findIndex((t) => t.id === id); const t = day.tasks[index];
  if (!t) return;
  dispatch(date, { op: 'del', date, id });
  hooks.toast('Task deleted', 'Undo', () => dispatch(date, { op: 'add', date, task: t, index }));
}

/* ---------- sync ---------- */
let flushing = false, flushTimer = 0, backoff = 0;
const lastPut = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function setStatus(state) {
  const el = document.getElementById('sync'); if (!el) return;
  el.dataset.state = state;
  document.getElementById('syncTxt').textContent = { saved: 'Saved', saving: 'Saving…', offline: 'Offline — will sync', retry: 'Retrying…' }[state];
}
export function scheduleFlush(ms = 700) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, ms); }
export async function flush() {
  if (flushing || !S.pending.length) { if (!S.pending.length) setStatus('saved'); return; }
  flushing = true; setStatus('saving');
  let failed = false;
  while (S.pending.length) {
    const w = S.pending[0].w;
    const wait = 1150 - (Date.now() - (lastPut[w] || 0));
    if (wait > 0) await sleep(wait); // KV allows one write per second per key
    const batch = S.pending.filter((p) => p.w === w).slice(0, 100);
    const res = await api(`/api/week/${w}`, { method: 'PUT', body: { ops: batch.map((p) => p.op) } });
    lastPut[w] = Date.now();
    if (res.ok) {
      S.pending = S.pending.filter((p) => !batch.includes(p));
      S.weeks[w] = res.data; touch(); persist(); hooks.render();
    } else if (res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 0) {
      S.pending = S.pending.filter((p) => !batch.includes(p)); touch(); persist(); hooks.render();
      hooks.toast('One change couldn’t be saved');
    } else { failed = true; break; }
  }
  flushing = false;
  if (failed) {
    setStatus(navigator.onLine ? 'retry' : 'offline');
    backoff = Math.min(30000, (backoff || 2000) * 2);
    scheduleFlush(backoff);
  } else { backoff = 0; setStatus('saved'); }
}

/* ---------- loading ---------- */
export async function ensureWeek(w) {
  if (S.weeks[w] !== undefined || loading.has(w)) return;
  loading.add(w);
  const r = await api(`/api/week/${w}`);
  loading.delete(w);
  if (r.ok) { S.weeks[w] = r.data; touch(); hooks.render(); } else setTimeout(() => hooks.render(), 4000);
}
export async function loadConfig() {
  const r = await api('/api/config');
  if (r.ok) { S.config = r.data; S.configLoaded = true; touch(); hooks.render(); }
  return r.ok;
}
let cfgTimer = 0;
export function saveConfigSoon(part) {
  touch(); hooks.render(); clearTimeout(cfgTimer); setStatus('saving');
  cfgTimer = setTimeout(async () => {
    const r = await api('/api/config', { method: 'PUT', body: part });
    if (r.ok) { S.config = r.data; touch(); setStatus(S.pending.length ? 'saving' : 'saved'); } else { setStatus('retry'); hooks.toast('Couldn’t save — try again'); }
  }, 500);
}
export const visibleWeeks = () => (S.view === 'day' ? [mondayOf(S.date)] : S.view === 'week' ? [S.weekStart] : []);

// Make sure what's on screen is loaded, and lay out the routine on days that haven't been opened yet.
export function ensureData() {
  const today = todayISO();
  const need = new Set(visibleWeeks());
  if ((S.view === 'day' && S.date === today) || (S.view === 'week' && S.weekStart === mondayOf(today))) { need.add(mondayOf(addDays(today, -1))); need.add(mondayOf(addDays(today, -7))); }
  need.forEach(ensureWeek);
  if (!S.configLoaded) return;
  const dates = S.view === 'day' ? [S.date] : S.view === 'week' ? [0, 1, 2, 3, 4].map((i) => addDays(S.weekStart, i)) : [];
  for (const d of dates) {
    if (d < today || isWeekend(d) || !weekLoaded(mondayOf(d))) continue;
    if (!dayOf(d).seeded) dispatch(d, { op: 'seed', date: d });
  }
}

/* ---------- carry-over: unfinished one-off tasks from the last week ---------- */
export function carryList() {
  const today = todayISO(); const out = [];
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, -i);
    if (!weekLoaded(mondayOf(d))) return null;
    for (const t of dayOf(d).tasks) if (!t.done && !t.skip && (!t.src || t.src.startsWith('p:'))) out.push({ date: d, t });
  }
  return out.reverse();
}

/* ---------- polling for changes made on another device ---------- */
export function startPolling() {
  const poll = async () => {
    if (document.hidden || S.pending.length || flushing || S.dragging) return;
    for (const w of visibleWeeks()) {
      const cur = S.weeks[w]; if (!cur) continue;
      const r = await api(`/api/week/${w}?ver=${encodeURIComponent(cur.ver || '')}`);
      if (r.ok && !r.data.unchanged && r.data.ver !== cur.ver && !S.pending.length) { S.weeks[w] = r.data; touch(); hooks.render(); }
    }
  };
  setInterval(poll, 8000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { poll(); flush(); } });
  window.addEventListener('online', () => flush());
  window.addEventListener('offline', () => setStatus('offline'));
}
